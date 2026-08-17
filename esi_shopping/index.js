(() => {
  'use strict';
  const AUTHORIZE = 'https://login.eveonline.com/v2/oauth/authorize';
  const TOKEN = 'https://login.eveonline.com/v2/oauth/token';
  const CLIENT_ID = window.EVE_CLIENT_ID;
  if (!CLIENT_ID) throw new Error('EVE_CLIENT_ID is not configured.');
  const SCOPES = [
    'esi-assets.read_assets.v1',
    'esi-universe.read_structures.v1',
  ];
  let assetGroups = [];
  let treeExpanded = false;
  let currentFit = null;
  let currentDiffRows = [];
  let duplicateTypeGroupsPromise;
  const SAVED_FITS_KEY = 'eve_saved_fit_plans_v1';
  let savedFitPlans = loadSavedFitPlans();
  let editingPlanId = '';
  let editingOriginalHull = '';
  const hullClassCache = new Map();
  const $ = (id) => document.getElementById(id);
  const redirectUri = location.origin + location.pathname;
  $('redirectUri').textContent = redirectUri;

  const bytesToBase64Url = (bytes) => {
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };
  const randomString = (size) =>
    bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
  const decodeJwt = (token) => {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(part), (c) => c.charCodeAt(0)),
      ),
    );
  };
  const showError = (message, dashboard = false) => {
    const el = dashboard ? $('dashError') : $('error');
    el.textContent = message;
    el.classList.add('show');
  };
  const clearError = () =>
    document
      .querySelectorAll('.error')
      .forEach((el) => el.classList.remove('show'));
  const apiError = async (response) => {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error_description || body.error || body.message || '';
    } catch (_) {}
    return `${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`;
  };

  async function beginLogin() {
    clearError();
    if (location.protocol === 'file:')
      return showError(
        'Open this page from a static web host (HTTPS) or localhost so EVE can redirect back to it.',
      );
    const verifier = randomString(32);
    const state = randomString(24);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    );
    sessionStorage.setItem('eve_pkce_verifier', verifier);
    sessionStorage.setItem('eve_oauth_state', state);
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
      code_challenge: bytesToBase64Url(new Uint8Array(digest)),
      code_challenge_method: 'S256',
    });
    location.assign(`${AUTHORIZE}?${query}`);
  }

  async function exchangeCode(code) {
    const state = new URLSearchParams(location.search).get('state');
    const expectedState = sessionStorage.getItem('eve_oauth_state');
    const verifier = sessionStorage.getItem('eve_pkce_verifier');
    if (!state || !expectedState || state !== expectedState)
      throw new Error('Login state did not match. Please start again.');
    if (!verifier)
      throw new Error('Login session expired. Please start again.');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
    const response = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok)
      throw new Error(`Token exchange failed: ${await apiError(response)}`);
    const tokens = await response.json();
    saveTokens(tokens);
    sessionStorage.removeItem('eve_pkce_verifier');
    sessionStorage.removeItem('eve_oauth_state');
    history.replaceState({}, document.title, redirectUri);
    return tokens.access_token;
  }

  function saveTokens(tokens) {
    sessionStorage.setItem('eve_access_token', tokens.access_token);
    if (tokens.refresh_token)
      sessionStorage.setItem('eve_refresh_token', tokens.refresh_token);
    sessionStorage.setItem(
      'eve_token_expires',
      String(Date.now() + (tokens.expires_in - 30) * 1000),
    );
  }

  async function accessToken() {
    const token = sessionStorage.getItem('eve_access_token');
    if (
      token &&
      Date.now() < Number(sessionStorage.getItem('eve_token_expires'))
    )
      return token;
    const refreshToken = sessionStorage.getItem('eve_refresh_token');
    if (!refreshToken)
      throw new Error('Your session has expired. Please connect again.');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    const response = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok)
      throw new Error(`Could not refresh login: ${await apiError(response)}`);
    const tokens = await response.json();
    saveTokens(tokens);
    return tokens.access_token;
  }

  function validateClaims(claims) {
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      ![
        'https://login.eveonline.com/',
        'login.eveonline.com',
        'https://login.eveonline.com',
      ].includes(claims.iss)
    )
      throw new Error('The login token has an unexpected issuer.');
    if (!audience.includes('EVE Online') || !audience.includes(CLIENT_ID))
      throw new Error('The login token was not issued for this application.');
    if (!claims.exp || claims.exp * 1000 <= Date.now())
      throw new Error('The login token has expired.');
    const scopes = Array.isArray(claims.scp)
      ? claims.scp
      : String(claims.scp || '').split(' ');
    if (!scopes.includes(SCOPES[0]))
      throw new Error('Asset permission was not granted.');
    const match = /^CHARACTER:EVE:(\d+)$/.exec(claims.sub || '');
    if (!match)
      throw new Error('No EVE character was found in the login token.');
    return match[1];
  }

  const chunks = (items, size = 1000) => {
    const result = [];
    for (let i = 0; i < items.length; i += size)
      result.push(items.slice(i, i + size));
    return result;
  };

  async function esiJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok)
      throw new Error(`ESI request failed: ${await apiError(response)}`);
    return { data: await response.json(), response };
  }

  async function fetchAllAssets(id, token) {
    const url = `https://esi.evetech.net/characters/${id}/assets/`;
    const headers = { Authorization: `Bearer ${token}` };
    const first = await esiJson(`${url}?page=1`, { headers });
    const pages = Number(first.response.headers.get('X-Pages') || 1);
    if (pages === 1) return first.data;
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        esiJson(`${url}?page=${index + 2}`, { headers }).then(
          (result) => result.data,
        ),
      ),
    );
    return first.data.concat(...rest);
  }

  async function resolveNames(ids) {
    const names = new Map();
    const resolveBatch = async (batch) => {
      try {
        const result = await esiJson(
          'https://esi.evetech.net/universe/names/',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          },
        );
        result.data.forEach((entry) => names.set(String(entry.id), entry.name));
      } catch (_) {
        if (batch.length > 1) {
          const middle = Math.ceil(batch.length / 2);
          await Promise.all([
            resolveBatch(batch.slice(0, middle)),
            resolveBatch(batch.slice(middle)),
          ]);
        } else if (batch.length === 1) {
          // Inventory types have a dedicated endpoint. This also ensures one
          // bad ID never hides valid module names from the same batch.
          try {
            const result = await esiJson(
              `https://esi.evetech.net/universe/types/${batch[0]}/`,
            );
            if (result.data.name) names.set(String(batch[0]), result.data.name);
          } catch (_) {
            /* Keep the numeric type fallback for genuinely unknown IDs. */
          }
        }
      }
    };
    for (const batch of chunks([...new Set(ids)])) {
      if (batch.length) await resolveBatch(batch);
    }
    return names;
  }

  async function resolveLocationNames(ids, token) {
    const uniqueIds = [...new Set(ids.map(String))];
    const names = new Map();

    // Resolve locations separately so one private structure cannot invalidate
    // a batch containing otherwise public station and solar-system names.
    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const result = await esiJson(
            'https://esi.evetech.net/universe/names/',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([Number(id)]),
            },
          );
          if (result.data[0]?.name) names.set(id, result.data[0].name);
        } catch (_) {
          /* Try a location-specific endpoint below. */
        }
      }),
    );

    await Promise.all(
      uniqueIds
        .filter((id) => !names.has(id))
        .map(async (id) => {
          const numericId = Number(id);
          let url;
          if (numericId >= 60000000 && numericId < 64000000)
            url = `https://esi.evetech.net/universe/stations/${id}/`;
          else if (numericId > 1000000000000)
            url = `https://esi.evetech.net/universe/structures/${id}/`;
          if (!url) return;
          try {
            const result = await esiJson(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (result.data.name) names.set(id, result.data.name);
          } catch (_) {
            /* The character may not have access to this structure's name. */
          }
        }),
    );
    return names;
  }

  async function duplicateTypeGroups() {
    if (!duplicateTypeGroupsPromise) {
      duplicateTypeGroupsPromise = fetch('./dupes.json')
        .then((response) => {
          if (!response.ok)
            throw new Error(`Could not load dupes.json: ${response.status}`);
          return response.json();
        })
        .then((groups) => {
          const canonicalById = new Map();
          Object.values(groups).forEach((members) => {
            if (!Array.isArray(members) || !members.length) return;
            const canonical = String(Math.min(...members.map(Number)));
            members.forEach((id) => canonicalById.set(String(id), canonical));
          });
          return canonicalById;
        });
    }
    return duplicateTypeGroupsPromise;
  }

  async function resolveTypeIdsByName(names) {
    const idsByName = new Map();
    for (const batch of chunks([...new Set(names)], 500)) {
      const result = await esiJson('https://esi.evetech.net/universe/ids/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      (result.data.inventory_types || []).forEach((type) =>
        idsByName.set(type.name.toLocaleLowerCase(), type.id),
      );
    }
    return idsByName;
  }

  async function classifyHull(typeId) {
    if (!typeId)
      return { groupName: 'Unknown', isBattleship: false, isFrigate: false };
    const key = String(typeId);
    if (hullClassCache.has(key)) return hullClassCache.get(key);
    const classification = (async () => {
      const type = await esiJson(
        `https://esi.evetech.net/universe/types/${typeId}/`,
      );
      const group = await esiJson(
        `https://esi.evetech.net/universe/groups/${type.data.group_id}/`,
      );
      const groupName = group.data.name || '';
      return {
        groupName,
        isBattleship: /battleship|marauder|black ops/i.test(groupName),
        isFrigate:
          /frigate|interceptor|covert ops|electronic attack ship/i.test(
            groupName,
          ),
      };
    })();
    hullClassCache.set(key, classification);
    return classification;
  }

  async function resolveCustomNames(id, token, assets) {
    const names = new Map();
    const singletonIds = assets
      .filter((asset) => asset.is_singleton)
      .map((asset) => asset.item_id);
    for (const batch of chunks(singletonIds)) {
      try {
        const result = await esiJson(
          `https://esi.evetech.net/characters/${id}/assets/names/`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(batch),
          },
        );
        result.data.forEach((entry) =>
          names.set(String(entry.item_id), entry.name),
        );
      } catch (_) {
        /* Custom names are optional; type names still identify every asset. */
      }
    }
    return names;
  }

  function buildAssetTree(assets, typeNames, locationNames, customNames) {
    const byId = new Map(
      assets.map((asset) => [
        String(asset.item_id),
        { ...asset, children: [] },
      ]),
    );
    const roots = new Map();
    for (const node of byId.values()) {
      node.typeName =
        typeNames.get(String(node.type_id)) || `Type ${node.type_id}`;
      node.customName = customNames.get(String(node.item_id)) || '';
      node.name = node.customName && node.customName !== 'None'
        ? `${node.typeName} — ${node.customName}`
        : node.typeName;
      const parent = byId.get(String(node.location_id));
      if (parent && parent !== node) parent.children.push(node);
      else {
        const key = String(node.location_id);
        if (!roots.has(key)) roots.set(key, []);
        roots.get(key).push(node);
      }
    }
    const sortNodes = (nodes) => {
      nodes.sort(
        (a, b) =>
          Number(Boolean(b.children.length)) -
            Number(Boolean(a.children.length)) || a.name.localeCompare(b.name),
      );
      nodes.forEach((node) => sortNodes(node.children));
    };
    return [...roots]
      .map(([id, children]) => {
        sortNodes(children);
        const flags = [...new Set(children.map((item) => item.location_flag))];
        const resolvedName = locationNames.get(id);
        return {
          id,
          name: resolvedName || `Hangar #${id}`,
          detail: resolvedName
            ? `Hangar #${id}`
            : flags.join(' / ') || 'Unknown location',
          children,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderTree() {
    const query = $('assetSearch').value.trim().toLowerCase();
    const root = document.createElement('ul');
    const matches = (node) =>
      !query ||
      node.name.toLowerCase().includes(query) ||
      node.typeName.toLowerCase().includes(query) ||
      node.children.some(matches);
    const renderNode = (node) => {
      if (!matches(node)) return null;
      const li = document.createElement('li');
      if (!treeExpanded && !query) li.classList.add('collapsed');
      const row = document.createElement('div');
      row.className = 'tree-row';
      const twisty = document.createElement('button');
      twisty.className = `twisty${node.children.length ? '' : ' blank'}`;
      twisty.type = 'button';
      twisty.textContent = '▾';
      twisty.addEventListener('click', () => {
        li.classList.toggle('collapsed');
        twisty.textContent = li.classList.contains('collapsed') ? '▸' : '▾';
      });
      const icon = document.createElement('img');
      icon.className = 'node-icon';
      icon.alt = '';
      icon.loading = 'lazy';
      icon.src = `https://images.evetech.net/types/${node.type_id}/icon?size=32`;
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = node.name;
      const meta = document.createElement('span');
      meta.className = 'node-meta';
      meta.textContent = `× ${node.quantity.toLocaleString()} · ${node.location_flag}`;
      row.append(twisty, icon, name, meta);
      li.append(row);
      if (node.children.length) {
        const ul = document.createElement('ul');
        node.children.forEach((child) => {
          const childEl = renderNode(child);
          if (childEl) ul.append(childEl);
        });
        li.append(ul);
      }
      return li;
    };
    assetGroups.forEach((group) => {
      const visible =
        !query ||
        group.name.toLowerCase().includes(query) ||
        group.children.some(matches);
      if (!visible) return;
      const li = document.createElement('li');
      if (!treeExpanded && !query) li.classList.add('collapsed');
      const row = document.createElement('div');
      row.className = 'tree-row location-row';
      const twisty = document.createElement('button');
      twisty.className = 'twisty';
      twisty.type = 'button';
      twisty.textContent = li.classList.contains('collapsed') ? '▸' : '▾';
      twisty.addEventListener('click', () => {
        li.classList.toggle('collapsed');
        twisty.textContent = li.classList.contains('collapsed') ? '▸' : '▾';
      });
      const icon = document.createElement('span');
      icon.className = 'node-icon';
      icon.textContent = '⌾';
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = group.name;
      const meta = document.createElement('span');
      meta.className = 'node-meta';
      meta.textContent = group.detail;
      row.append(twisty, icon, name, meta);
      li.append(row);
      const ul = document.createElement('ul');
      group.children.forEach((node) => {
        const nodeEl = renderNode(node);
        if (nodeEl) ul.append(nodeEl);
      });
      li.append(ul);
      root.append(li);
    });
    $('assetTree').replaceChildren(root);
    if (!root.children.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = query ? 'No matching assets.' : 'No assets found.';
      $('assetTree').replaceChildren(empty);
    }
  }

  function loadSavedFitPlans() {
    try {
      const plans = JSON.parse(localStorage.getItem(SAVED_FITS_KEY) || '[]');
      return Array.isArray(plans) ? plans : [];
    } catch (_) {
      return [];
    }
  }

  function persistFitPlans() {
    localStorage.setItem(SAVED_FITS_KEY, JSON.stringify(savedFitPlans));
  }

  async function hydrateSavedPlanClasses() {
    const pending = savedFitPlans.filter(
      (plan) =>
        typeof plan.isBattleship !== 'boolean' ||
        typeof plan.isFrigate !== 'boolean',
    );
    if (!pending.length) return;
    const missingHullIds = pending.filter((plan) => !plan.hullTypeId);
    if (missingHullIds.length) {
      const ids = await resolveTypeIdsByName(
        missingHullIds.map((plan) => plan.hull),
      );
      missingHullIds.forEach((plan) => {
        plan.hullTypeId = ids.get(plan.hull.toLocaleLowerCase());
      });
    }
    await Promise.all(
      pending.map(async (plan) => {
        const classification = await classifyHull(plan.hullTypeId);
        Object.assign(plan, classification);
      }),
    );
    persistFitPlans();
  }

  function findAssetNode(itemId) {
    let found;
    const visit = (node) => {
      if (String(node.item_id) === String(itemId)) found = node;
      else if (!found) node.children.forEach(visit);
    };
    assetGroups.forEach((group) => group.children.forEach(visit));
    return found;
  }

  function findAssetGroupForItem(itemId) {
    if (!itemId) return null;
    let matchedGroup = null;
    const contains = (node) =>
      String(node.item_id) === String(itemId) || node.children.some(contains);
    for (const group of assetGroups) {
      if (group.children.some(contains)) {
        matchedGroup = group;
        break;
      }
    }
    return matchedGroup;
  }

  function parseEft(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const headerIndex = lines.findIndex((line) => line.trim());
    if (headerIndex < 0) throw new Error('Paste an EFT fit first.');
    const headerLine = lines[headerIndex].trim();
    const headerBody =
      headerLine.startsWith('[') && headerLine.endsWith(']')
        ? headerLine.slice(1, -1)
        : '';
    const separator = headerBody.indexOf(',');
    const hull = separator >= 0 ? headerBody.slice(0, separator).trim() : '';
    const fitName =
      separator >= 0 ? headerBody.slice(separator + 1).trim() : '';
    if (!hull || !fitName)
      throw new Error('The first line must look like [Ship type, Fit name].');

    const items = new Map();
    const addItem = (rawName, defaultQuantity = 1) => {
      let name = rawName
        .trim()
        .replace(/\s*\/offline\s*$/i, '')
        .trim();
      if (!name || /^\[Empty (low|med|high|rig|service) slot\]$/i.test(name))
        return;
      const quantityMatch = /\s+x(\d+)\s*$/i.exec(name);
      const quantity = quantityMatch
        ? Number(quantityMatch[1])
        : defaultQuantity;
      if (quantityMatch) name = name.slice(0, quantityMatch.index).trim();
      if (!name || !Number.isSafeInteger(quantity) || quantity < 1)
        throw new Error(`Invalid quantity on EFT line: ${rawName}`);
      const key = name.toLocaleLowerCase();
      const existing = items.get(key);
      if (existing) existing.quantity += quantity;
      else items.set(key, { name, quantity });
    };

    lines.slice(headerIndex + 1).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const comma = line.indexOf(',');
      if (comma >= 0) {
        addItem(line.slice(0, comma));
        addItem(line.slice(comma + 1));
      } else addItem(line);
    });
    return {
      hull,
      name: fitName,
      items,
    };
  }

  function ownedShipsForFit(fit) {
    const ships = [];
    const visit = (node, locationName) => {
      if (
        node.is_singleton &&
        node.typeName.toLocaleLowerCase() === fit.hull.toLocaleLowerCase()
      )
        ships.push({ node, locationName });
      node.children.forEach((child) => visit(child, locationName));
    };
    assetGroups.forEach((group) =>
      group.children.forEach((node) => visit(node, group.name)),
    );
    return ships;
  }

  function populateShipSelect() {
    const select = $('shipSelect');
    select.replaceChildren();
    if (!currentFit) {
      currentDiffRows = [];
      $('shoppingPanel').hidden = true;
      $('shoppingList').hidden = true;
      select.append(new Option('Load a fit first', ''));
      select.disabled = true;
      return;
    }
    const ships = ownedShipsForFit(currentFit);
    if (!ships.length) {
      currentDiffRows = [];
      $('shoppingPanel').hidden = true;
      $('shoppingList').hidden = true;
      select.append(new Option(`No owned ${currentFit.hull} ships found`, ''));
      select.disabled = true;
      $('fitResults').replaceChildren();
      $('fitMessage').textContent =
        `The fit loaded, but this character has no assembled ${currentFit.hull} to compare.`;
      return;
    }
    ships.forEach(({ node, locationName }, index) => {
      const label = `${node.name} — ${locationName} (#${node.item_id})`;
      select.append(
        new Option(label, String(node.item_id), index === 0, index === 0),
      );
    });
    select.disabled = false;
    compareSelectedShip();
  }

  function compareSelectedShip() {
    const selectedId = $('shipSelect').value;
    if (!currentFit || !selectedId) return;
    let selectedShip;
    const visit = (node) => {
      if (String(node.item_id) === selectedId) selectedShip = node;
      else if (!selectedShip) node.children.forEach(visit);
    };
    assetGroups.forEach((group) => group.children.forEach(visit));
    if (!selectedShip) return;

    const canonicalById = currentFit.canonicalById;
    const comparisonKey = (typeId, name) => {
      if (typeId != null) {
        const id = String(typeId);
        return `type:${canonicalById.get(id) || id}`;
      }
      return `name:${name.toLocaleLowerCase()}`;
    };

    const wantedItems = new Map();
    const addWanted = (item) => {
      const key = comparisonKey(item.typeId, item.name);
      const entry = wantedItems.get(key) || { name: item.name, quantity: 0 };
      entry.quantity += item.quantity;
      wantedItems.set(key, entry);
    };
    currentFit.items.forEach(addWanted);
    const escapeFit = currentFit.escapeFitPlanId
      ? savedFitPlans.find((plan) => plan.id === currentFit.escapeFitPlanId)
      : null;
    if (escapeFit) {
      addWanted({
        name: escapeFit.hull,
        typeId: escapeFit.hullTypeId,
        quantity: 1,
      });
      escapeFit.items.forEach(addWanted);
    }

    const actual = new Map();
    const addActual = (item, parentPath = '') => {
      const key = comparisonKey(item.type_id, item.typeName);
      const entry = actual.get(key) || {
        name: item.typeName,
        quantity: 0,
        flags: new Set(),
      };
      entry.quantity += item.quantity;
      const locationPath = parentPath
        ? `${parentPath}/${item.location_flag}`
        : item.location_flag;
      entry.flags.add(locationPath);
      actual.set(key, entry);
      item.children.forEach((child) => addActual(child, locationPath));
    };
    selectedShip.children.forEach((item) => addActual(item));

    const keys = new Set([...wantedItems.keys(), ...actual.keys()]);
    const rows = [...keys]
      .map((key) => {
        const wanted = wantedItems.get(key);
        const owned = actual.get(key);
        const required = wanted?.quantity || 0;
        const present = owned?.quantity || 0;
        return {
          name: wanted?.name || owned.name,
          required,
          present,
          difference: present - required,
          flags: owned ? [...owned.flags].join(', ') : '—',
        };
      })
      .filter((item) => item.difference !== 0)
      .sort((a, b) => {
        const statusA = a.difference < 0 ? 0 : a.required === 0 ? 1 : 2;
        const statusB = b.difference < 0 ? 0 : b.required === 0 ? 1 : 2;
        return statusA - statusB || a.name.localeCompare(b.name);
      });
    currentDiffRows = rows;
    $('shoppingList').hidden = true;
    $('shoppingList').value = '';
    $('shoppingPanel').hidden = !rows.some((item) => item.difference < 0);
    $('closeFitDiff').hidden = false;

    if (!rows.length) {
      $('fitResults').replaceChildren();
      $('fitMessage').classList.remove('bad');
      $('fitMessage').textContent =
        `${currentFit.name} · No differences — this ship matches the EFT fit.`;
      return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    ['Item', 'Actual Location', 'Required', 'Assigned', 'Difference'].forEach((text) => {
      const th = document.createElement('th');
      th.textContent = text;
      heading.append(th);
    });
    thead.append(heading);
    table.append(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((item) => {
      const tr = document.createElement('tr');
      tr.className =
        item.difference < 0
          ? 'missing'
          : item.required === 0
            ? 'extra'
            : 'match';
      const values = [
        item.name,
        item.flags,
        item.required.toLocaleString(),
        item.present.toLocaleString(),
        item.difference > 0
          ? `+${item.difference.toLocaleString()}`
          : item.difference.toLocaleString(),
      ];
      values.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(tbody);
    $('fitResults').replaceChildren(table);
    const missing = rows.filter((item) => item.difference < 0).length;
    const extra = rows.filter((item) => item.required === 0).length;
    $('fitMessage').classList.remove('bad');
    $('fitMessage').textContent =
      `${currentFit.name} · ${missing} missing item type${missing === 1 ? '' : 's'} · ${extra} extra item type${extra === 1 ? '' : 's'}`;
  }

  async function loadEftFit() {
    $('fitMessage').classList.remove('bad');
    $('parseFit').disabled = true;
    try {
      const parsedFit = parseEft($('eftInput').value);
      const changedHullWhileEditing =
        Boolean(editingPlanId) &&
        parsedFit.hull.toLocaleLowerCase() !==
          editingOriginalHull.toLocaleLowerCase();
      $('fitMessage').textContent = 'Resolving EFT item types…';
      const [idsByName, canonicalById] = await Promise.all([
        resolveTypeIdsByName([
          parsedFit.hull,
          ...[...parsedFit.items.values()].map((item) => item.name),
        ]),
        duplicateTypeGroups(),
      ]);
      parsedFit.items.forEach((item) => {
        item.typeId = idsByName.get(item.name.toLocaleLowerCase());
      });
      parsedFit.hullTypeId =
        idsByName.get(parsedFit.hull.toLocaleLowerCase()) ||
        ownedShipsForFit(parsedFit)[0]?.node.type_id;
      Object.assign(parsedFit, await classifyHull(parsedFit.hullTypeId));
      parsedFit.canonicalById = canonicalById;
      currentFit = parsedFit;
      populateShipSelect();
      updateFitPlannerControls();
      if (changedHullWhileEditing) {
        const originalHull = editingOriginalHull;
        cancelPlanEdit(
          `Ship type changed from ${originalHull} to ${parsedFit.hull}. The original plan is unchanged; saving will create a new fit.`,
        );
      }
    } catch (error) {
      currentFit = null;
      populateShipSelect();
      updateFitPlannerControls();
      $('fitResults').replaceChildren();
      $('fitMessage').classList.add('bad');
      $('fitMessage').textContent = error.message || String(error);
    } finally {
      $('parseFit').disabled = false;
    }
  }

  function generateShoppingList() {
    const lines = currentDiffRows
      .filter((item) => item.difference < 0)
      .map((item) => `${Math.abs(item.difference)}x ${item.name}`);
    $('shoppingList').value = lines.join('\n');
    $('shoppingList').hidden = false;
    $('closeShopping').hidden = false;
    $('shoppingList').focus();
    $('shoppingList').select();
  }

  function closeFitDiff() {
    $('fitResults').replaceChildren();
    $('closeFitDiff').hidden = true;
    $('shoppingPanel').hidden = true;
    $('shoppingList').hidden = true;
    $('closeShopping').hidden = true;
    $('fitMessage').textContent = '';
  }

  function closeShoppingList() {
    $('shoppingList').hidden = true;
    $('closeShopping').hidden = true;
  }

  function clearFitInput() {
    if (editingPlanId) cancelPlanEdit('Edit canceled because the EFT input was cleared.');
    $('eftInput').value = '';
    currentFit = null;
    currentDiffRows = [];
    populateShipSelect();
    updateFitPlannerControls();
    closeFitDiff();
  }

  function updateCompareEscapeControl() {
    const field = $('compareEscapeField');
    const select = $('compareEscapeFit');
    select.replaceChildren(new Option('Choose a saved frigate fit', ''));
    savedFitPlans
      .filter((plan) => plan.isFrigate)
      .forEach((plan) =>
        select.append(new Option(`${plan.name} · ${plan.hull}`, plan.id)),
      );
    if (
      currentFit?.escapeFitPlanId &&
      [...select.options].some(
        (option) => option.value === currentFit.escapeFitPlanId,
      )
    ) select.value = currentFit.escapeFitPlanId;
    field.hidden = !currentFit?.isBattleship;
  }

  function updateFitPlannerControls() {
    const stationSelect = $('fitStation');
    const previousStation = stationSelect.value;
    stationSelect.replaceChildren();
    assetGroups.forEach((group) =>
      stationSelect.append(new Option(group.name, group.id)),
    );
    const comparedShipGroup = findAssetGroupForItem($('shipSelect').value);
    if (comparedShipGroup) stationSelect.value = comparedShipGroup.id;
    else if (
      previousStation &&
      assetGroups.some((group) => group.id === previousStation)
    )
      stationSelect.value = previousStation;
    stationSelect.disabled = !assetGroups.length;

    const shipSelect = $('fitShips');
    shipSelect.replaceChildren();
    if (currentFit) {
      ownedShipsForFit(currentFit).forEach(({ node, locationName }) => {
        shipSelect.append(
          new Option(
            `${node.name} — ${locationName} (#${node.item_id})`,
            String(node.item_id),
          ),
        );
      });
      if (!shipSelect.options.length)
        shipSelect.append(new Option(`No owned ${currentFit.hull} ships`, ''));
      const comparedShipId = $('shipSelect').value;
      if (comparedShipId) {
        [...shipSelect.options].forEach((option) => {
          option.selected = option.value === comparedShipId;
        });
      }
      shipSelect.disabled = false;
    } else {
      shipSelect.append(new Option('Load an EFT fit first', ''));
      shipSelect.disabled = true;
    }
    const escapeField = $('escapeFitField');
    const escapeSelect = $('escapeFit');
    const previousEscapeFit = currentFit?.escapeFitPlanId || escapeSelect.value;
    escapeSelect.replaceChildren(new Option('Choose a saved frigate fit', ''));
    savedFitPlans
      .filter((plan) => plan.isFrigate)
      .forEach((plan) =>
        escapeSelect.append(new Option(`${plan.name} · ${plan.hull}`, plan.id)),
      );
    if (
      [...escapeSelect.options].some(
        (option) => option.value === previousEscapeFit,
      )
    )
      escapeSelect.value = previousEscapeFit;
    escapeField.hidden = !currentFit?.isBattleship;
    updateCompareEscapeControl();
    $('saveFit').disabled = !currentFit || !assetGroups.length;
  }

  function selectComparedShipForPlan() {
    const comparedShipId = $('shipSelect').value;
    if (!comparedShipId || $('fitShips').disabled) return;
    [...$('fitShips').options].forEach((option) => {
      option.selected = option.value === comparedShipId;
    });
    const group = findAssetGroupForItem(comparedShipId);
    if (group) $('fitStation').value = group.id;
  }

  function renderSavedFitPlans() {
    const root = $('savedFits');
    root.replaceChildren();
    savedFitPlans.forEach((plan) => {
      const card = document.createElement('article');
      card.className = 'saved-fit';
      const head = document.createElement('div');
      head.className = 'saved-fit-head';
      const text = document.createElement('div');
      const title = document.createElement('h4');
      title.textContent = `${plan.name} · ${plan.hull}`;
      const detail = document.createElement('p');
      const assigned = plan.shipIds?.length || 0;
      detail.textContent = `${plan.copies} cop${plan.copies === 1 ? 'y' : 'ies'} at ${plan.stationName} · ${assigned} ship${assigned === 1 ? '' : 's'} assigned`;
      text.append(title, detail);
      const exemptEscapeFrigate =
        plan.isFrigate && /escape/i.test(plan.name || '');
      if (assigned === 0 && !exemptEscapeFrigate) {
        card.classList.add('unassigned');
        const warning = document.createElement('p');
        warning.className = 'assignment-warning';
        warning.textContent = '⚠ No ships are assigned to this fit.';
        text.append(warning);
      }
      const misplacedShips = (plan.shipIds || []).flatMap((shipId) => {
        const ship = findAssetNode(shipId);
        if (!ship) return [];
        const group = findAssetGroupForItem(shipId);
        if (!group || String(group.id) === String(plan.stationId)) return [];
        return [{ ship, group }];
      });
      if (misplacedShips.length) {
        card.classList.add('misplaced');
        const warning = document.createElement('p');
        warning.className = 'location-warning';
        warning.textContent = `⚠ ${misplacedShips.length === 1 ? 'An assigned ship is' : `${misplacedShips.length} assigned ships are`} not in the destination station.`;
        warning.title = misplacedShips
          .map(({ ship, group }) => `${ship.name}: ${group.name}`)
          .join('\n');
        text.append(warning);
      }
      const actions = document.createElement('div');
      actions.className = 'saved-fit-actions';
      const showDiff = document.createElement('button');
      showDiff.type = 'button';
      showDiff.textContent = 'Show diff';
      showDiff.addEventListener('click', () =>
        showSavedPlanDiff(plan, card, showDiff),
      );
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editSavedFitPlan(plan));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.className = 'remove-plan';
      remove.addEventListener('click', () => {
        savedFitPlans = savedFitPlans.filter((item) => item.id !== plan.id);
        savedFitPlans.forEach((item) => {
          if (item.escapeFitPlanId === plan.id) item.escapeFitPlanId = '';
        });
        if (editingPlanId === plan.id) cancelPlanEdit();
        persistFitPlans();
        renderSavedFitPlans();
        updateFitPlannerControls();
      });
      actions.append(showDiff, edit, remove);
      head.append(text, actions);
      card.append(head);
      if (plan.isBattleship) {
        const label = document.createElement('label');
        label.textContent = 'Escape bay frigate fit';
        const select = document.createElement('select');
        select.append(new Option('Choose a saved frigate fit', ''));
        savedFitPlans
          .filter((candidate) => candidate.isFrigate)
          .forEach((candidate) =>
            select.append(
              new Option(`${candidate.name} · ${candidate.hull}`, candidate.id),
            ),
          );
        select.value = plan.escapeFitPlanId || '';
        select.addEventListener('change', () => {
          plan.escapeFitPlanId = select.value;
          persistFitPlans();
          if (currentFit?.isBattleship && currentFit.name === plan.name) {
            currentFit.escapeFitPlanId = select.value;
            $('escapeFit').value = select.value;
            $('compareEscapeFit').value = select.value;
            compareSelectedShip();
          }
        });
        card.append(label, select);
      }
      root.append(card);
    });
    $('fleetShoppingPanel').hidden = !savedFitPlans.length;
    $('fleetShoppingList').hidden = true;
    $('closeFleetShopping').hidden = true;
  }

  async function calculateSavedPlanDiff(plan) {
    const canonicalById = await duplicateTypeGroups();
    const keyFor = (typeId, name) => {
      if (typeId != null) {
        const id = String(typeId);
        return `type:${canonicalById.get(id) || id}`;
      }
      return `name:${name.toLocaleLowerCase()}`;
    };
    const required = new Map();
    const present = new Map();
    const assignedShips = (plan.shipIds || [])
      .map((shipId) => findAssetNode(shipId))
      .filter(Boolean);
    const effectiveCopies = Math.max(plan.copies, assignedShips.length);
    const add = (map, typeId, name, quantity, location = '') => {
      const key = keyFor(typeId, name);
      const entry = map.get(key) || { name, quantity: 0, locations: new Set() };
      entry.quantity += quantity;
      if (location) entry.locations.add(location);
      map.set(key, entry);
    };
    add(required, plan.hullTypeId, plan.hull, effectiveCopies);
    plan.items.forEach((item) =>
      add(required, item.typeId, item.name, item.quantity * effectiveCopies),
    );
    if (plan.isBattleship) {
      const escapeFit = savedFitPlans.find(
        (candidate) => candidate.id === plan.escapeFitPlanId,
      );
      if (!escapeFit) throw new Error(`${plan.name} needs an escape bay frigate fit.`);
      add(required, escapeFit.hullTypeId, escapeFit.hull, effectiveCopies);
      escapeFit.items.forEach((item) =>
        add(required, item.typeId, item.name, item.quantity * effectiveCopies),
      );
    }
    assignedShips.forEach((ship) => {
      const shipGroup = findAssetGroupForItem(ship.item_id);
      add(present, ship.type_id, ship.typeName, 1, shipGroup?.name || 'Assets');
      const addContents = (item, parentPath = '') => {
        const locationPath = parentPath
          ? `${parentPath}/${item.location_flag}`
          : item.location_flag;
        add(present, item.type_id, item.typeName, item.quantity, locationPath);
        item.children.forEach((child) => addContents(child, locationPath));
      };
      ship.children.forEach(addContents);
    });
    const keys = new Set([...required.keys(), ...present.keys()]);
    return [...keys].map((key) => {
      const wanted = required.get(key);
      const owned = present.get(key);
      const requiredQuantity = wanted?.quantity || 0;
      const presentQuantity = owned?.quantity || 0;
      return {
        name: wanted?.name || owned.name,
        required: requiredQuantity,
        present: presentQuantity,
        difference: presentQuantity - requiredQuantity,
        locations: owned ? [...owned.locations].join(', ') : '—',
      };
    }).filter((item) => item.difference !== 0).sort((a, b) =>
      Number(a.difference >= 0) - Number(b.difference >= 0) || a.name.localeCompare(b.name),
    );
  }

  async function showSavedPlanDiff(plan, card, button) {
    const existing = card.querySelector('.saved-fit-diff');
    if (existing) {
      existing.remove();
      button.textContent = 'Show diff';
      return;
    }
    button.textContent = 'Hide diff';
    const output = document.createElement('div');
    output.className = 'saved-fit-diff';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close diff';
    close.addEventListener('click', () => {
      output.remove();
      button.textContent = 'Show diff';
    });
    const content = document.createElement('div');
    content.textContent = 'Calculating…';
    output.append(close, content);
    card.append(output);
    try {
      const rows = await calculateSavedPlanDiff(plan);
      if (!rows.length) {
        content.textContent = 'No differences — assigned ships satisfy this plan.';
        return;
      }
      const table = document.createElement('table');
      const heading = document.createElement('tr');
      ['Item', 'Actual Location', 'Required', 'Assigned', 'Difference'].forEach((value) => {
        const th = document.createElement('th'); th.textContent = value; heading.append(th);
      });
      const thead = document.createElement('thead'); thead.append(heading); table.append(thead);
      const tbody = document.createElement('tbody');
      rows.forEach((item) => {
        const tr = document.createElement('tr');
        tr.className =
          item.difference < 0
            ? 'missing'
            : item.required === 0
              ? 'extra'
              : 'match';
        [item.name, item.locations, item.required, item.present, item.difference > 0 ? `+${item.difference}` : item.difference].forEach((value) => {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(tbody); content.replaceChildren(table);
    } catch (error) {
      content.textContent = error.message || String(error);
    }
  }

  async function editSavedFitPlan(plan) {
    editingPlanId = plan.id;
    editingOriginalHull = plan.hull;
    const itemLines = plan.items.map((item) =>
      `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`,
    );
    $('eftInput').value = `[${plan.hull}, ${plan.name}]\n${itemLines.join('\n')}`;
    await loadEftFit();
    if (!currentFit) {
      cancelPlanEdit();
      return;
    }
    currentFit.escapeFitPlanId = plan.escapeFitPlanId || '';
    updateFitPlannerControls();
    if (![...$('fitStation').options].some((option) => option.value === plan.stationId))
      $('fitStation').append(new Option(plan.stationName, plan.stationId));
    $('fitStation').value = plan.stationId;
    $('fitCopies').value = plan.copies;
    [...$('fitShips').options].forEach((option) => {
      option.selected = (plan.shipIds || []).map(String).includes(option.value);
    });
    $('escapeFit').value = plan.escapeFitPlanId || '';
    $('saveFit').textContent = 'Update fit plan';
    $('cancelEdit').hidden = false;
    $('editState').textContent = `Editing saved fit: ${plan.name} · ${plan.hull}`;
    $('editState').hidden = false;
    $('planMessage').textContent = `Editing ${plan.name}.`;
    $('eftInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelPlanEdit(message = 'Edit canceled. The saved fit was not changed.') {
    editingPlanId = '';
    editingOriginalHull = '';
    $('saveFit').textContent = 'Save fit plan';
    $('cancelEdit').hidden = true;
    $('editState').hidden = true;
    $('editState').textContent = '';
    $('planMessage').classList.remove('bad');
    $('planMessage').textContent = message;
  }

  function saveCurrentFitPlan() {
    $('planMessage').classList.remove('bad');
    try {
      if (!currentFit) throw new Error('Load an EFT fit before saving a plan.');
      if (
        editingPlanId &&
        currentFit.hull.toLocaleLowerCase() !==
          editingOriginalHull.toLocaleLowerCase()
      ) {
        const originalHull = editingOriginalHull;
        cancelPlanEdit(
          `Ship type changed from ${originalHull} to ${currentFit.hull}; creating a new fit instead.`,
        );
      }
      const stationId = $('fitStation').value;
      const station = assetGroups.find((group) => group.id === stationId);
      if (!station) throw new Error('Choose a destination station.');
      const copies = Number($('fitCopies').value);
      if (!Number.isSafeInteger(copies) || copies < 0)
        throw new Error(
          'Desired copies must be zero or a positive whole number.',
        );
      const shipIds = [...$('fitShips').selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      const duplicateAssignment = savedFitPlans.find((plan) =>
        plan.id !== editingPlanId &&
        plan.shipIds?.some((id) => shipIds.includes(String(id))),
      );
      if (duplicateAssignment)
        throw new Error(
          `A selected ship is already assigned to ${duplicateAssignment.name}.`,
        );
      const escapeFitPlanId = currentFit.isBattleship
        ? $('escapeFit').value
        : '';
      if (currentFit.isBattleship && !escapeFitPlanId)
        throw new Error(
          'Choose a saved frigate fit for the battleship escape bay.',
        );
      const savedPlan = {
        id: editingPlanId || (crypto.randomUUID ? crypto.randomUUID() : randomString(18)),
        name: currentFit.name,
        hull: currentFit.hull,
        hullTypeId: currentFit.hullTypeId,
        items: [...currentFit.items.values()].map((item) => ({
          name: item.name,
          quantity: item.quantity,
          typeId: item.typeId,
        })),
        stationId,
        stationName: station.name,
        copies,
        shipIds,
        isBattleship: currentFit.isBattleship,
        isFrigate: currentFit.isFrigate,
        groupName: currentFit.groupName,
        escapeFitPlanId,
      };
      if (editingPlanId) {
        const index = savedFitPlans.findIndex((plan) => plan.id === editingPlanId);
        if (index >= 0) savedFitPlans[index] = savedPlan;
        else savedFitPlans.push(savedPlan);
      } else savedFitPlans.push(savedPlan);
      persistFitPlans();
      renderSavedFitPlans();
      updateFitPlannerControls();
      const action = editingPlanId ? 'Updated' : 'Saved';
      cancelPlanEdit();
      $('planMessage').textContent = `${action} ${currentFit.name}.`;
    } catch (error) {
      $('planMessage').classList.add('bad');
      $('planMessage').textContent = error.message || String(error);
    }
  }

  async function generateFleetShoppingList() {
    $('planMessage').classList.remove('bad');
    try {
      if (!savedFitPlans.length)
        throw new Error('Save at least one fit plan first.');
      const canonicalById = await duplicateTypeGroups();
      const keyFor = (typeId, name) => {
        if (typeId != null) {
          const id = String(typeId);
          return `type:${canonicalById.get(id) || id}`;
        }
        return `name:${name.toLocaleLowerCase()}`;
      };
      const stations = new Map();
      const usedShips = new Set();
      const adjust = (inventory, typeId, name, quantity) => {
        const key = keyFor(typeId, name);
        const entry = inventory.get(key) || { name, quantity: 0 };
        entry.quantity += quantity;
        inventory.set(key, entry);
      };

      for (const plan of savedFitPlans) {
        if (!stations.has(plan.stationId))
          stations.set(plan.stationId, {
            name: plan.stationName,
            items: new Map(),
          });
        const inventory = stations.get(plan.stationId).items;
        const assignedShips = (plan.shipIds || [])
          .map((shipId) => findAssetNode(shipId))
          .filter(Boolean);
        const effectiveCopies = Math.max(plan.copies, assignedShips.length);
        adjust(inventory, plan.hullTypeId, plan.hull, effectiveCopies);
        plan.items.forEach((item) =>
          adjust(
            inventory,
            item.typeId,
            item.name,
            item.quantity * effectiveCopies,
          ),
        );
        if (plan.isBattleship) {
          const escapeFit = savedFitPlans.find(
            (candidate) => candidate.id === plan.escapeFitPlanId,
          );
          if (!escapeFit)
            throw new Error(`${plan.name} needs an escape bay frigate fit.`);
          adjust(
            inventory,
            escapeFit.hullTypeId,
            escapeFit.hull,
            effectiveCopies,
          );
          escapeFit.items.forEach((item) =>
            adjust(
              inventory,
              item.typeId,
              item.name,
              item.quantity * effectiveCopies,
            ),
          );
        }
        for (const ship of assignedShips) {
          const shipId = String(ship.item_id);
          if (usedShips.has(shipId))
            throw new Error(
              `Ship #${shipId} is assigned to more than one saved fit.`,
            );
          usedShips.add(shipId);
          adjust(inventory, ship.type_id, ship.typeName, -1);
          const subtractContents = (item) => {
            adjust(inventory, item.type_id, item.typeName, -item.quantity);
            item.children.forEach(subtractContents);
          };
          ship.children.forEach(subtractContents);
        }
      }

      const sections = [];
      stations.forEach((station) => {
        const shortages = [...station.items.values()]
          .filter((item) => item.quantity > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!shortages.length) return;
        sections.push(
          `[${station.name}]\n${shortages.map((item) => `${item.quantity}x ${item.name}`).join('\n')}`,
        );
      });
      $('fleetShoppingList').value =
        sections.join('\n\n') || 'No items needed.';
      $('fleetShoppingList').hidden = false;
      $('closeFleetShopping').hidden = false;
      $('fleetShoppingList').focus();
      $('fleetShoppingList').select();
    } catch (error) {
      $('planMessage').classList.add('bad');
      $('planMessage').textContent = error.message || String(error);
    }
  }

  function closeFleetShoppingList() {
    $('fleetShoppingList').hidden = true;
    $('closeFleetShopping').hidden = true;
  }

  async function loadAssets() {
    clearError();
    $('refresh').disabled = true;
    $('status').textContent = 'Loading assets';
    try {
      const token = await accessToken();
      const claims = decodeJwt(token);
      const id = validateClaims(claims);
      const assets = await fetchAllAssets(id, token);
      const typeNames = await resolveNames(
        assets.map((asset) => asset.type_id),
      );
      const assetIds = new Set(assets.map((asset) => String(asset.item_id)));
      const rootLocationIds = assets
        .filter((asset) => !assetIds.has(String(asset.location_id)))
        .map((asset) => asset.location_id);
      const [locationNames, customNames] = await Promise.all([
        resolveLocationNames(rootLocationIds, token),
        resolveCustomNames(id, token, assets),
      ]);
      assetGroups = buildAssetTree(
        assets,
        typeNames,
        locationNames,
        customNames,
      );
      if (currentFit) populateShipSelect();
      updateFitPlannerControls();
      renderSavedFitPlans();
      $('characterName').textContent = claims.name || 'Capsuleer';
      $('characterId').textContent = `Character ${id}`;
      $('portrait').src =
        `https://images.evetech.net/characters/${id}/portrait?size=128`;
      $('assetCount').textContent = `${assets.length.toLocaleString()} items`;
      $('locationCount').textContent =
        `${assetGroups.length.toLocaleString()} locations`;
      renderTree();
      $('updated').textContent = `Updated ${new Date().toLocaleString()}`;
      $('setup').style.display = 'none';
      $('dashboard').style.display = 'block';
      $('status').textContent = 'Connected';
      $('status').classList.add('online');
    } catch (error) {
      const message = error.message || String(error);
      if ($('dashboard').style.display === 'block') showError(message, true);
      else {
        logout();
        showError(message);
      }
    } finally {
      $('refresh').disabled = false;
    }
  }

  function logout() {
    [
      'eve_access_token',
      'eve_refresh_token',
      'eve_token_expires',
      'eve_pkce_verifier',
      'eve_oauth_state',
    ].forEach((k) => sessionStorage.removeItem(k));
    history.replaceState({}, document.title, redirectUri);
    $('dashboard').style.display = 'none';
    $('setup').style.display = 'block';
    $('status').textContent = 'Disconnected';
    $('status').classList.remove('online');
    clearError();
  }

  $('login').addEventListener('click', beginLogin);
  $('refresh').addEventListener('click', loadAssets);
  $('logout').addEventListener('click', logout);
  $('assetSearch').addEventListener('input', renderTree);
  $('parseFit').addEventListener('click', loadEftFit);
  $('clearFit').addEventListener('click', clearFitInput);
  $('shipSelect').addEventListener('change', () => {
    compareSelectedShip();
    selectComparedShipForPlan();
  });
  $('generateShopping').addEventListener('click', generateShoppingList);
  $('closeFitDiff').addEventListener('click', closeFitDiff);
  $('closeShopping').addEventListener('click', closeShoppingList);
  $('escapeFit').addEventListener('change', () => {
    if (!currentFit) return;
    currentFit.escapeFitPlanId = $('escapeFit').value;
    $('compareEscapeFit').value = currentFit.escapeFitPlanId;
    compareSelectedShip();
  });
  $('compareEscapeFit').addEventListener('change', () => {
    if (!currentFit) return;
    currentFit.escapeFitPlanId = $('compareEscapeFit').value;
    $('escapeFit').value = currentFit.escapeFitPlanId;
    compareSelectedShip();
  });
  $('saveFit').addEventListener('click', saveCurrentFitPlan);
  $('cancelEdit').addEventListener('click', cancelPlanEdit);
  $('generateFleetShopping').addEventListener(
    'click',
    generateFleetShoppingList,
  );
  $('closeFleetShopping').addEventListener('click', closeFleetShoppingList);
  $('toggleTree').addEventListener('click', () => {
    treeExpanded = !treeExpanded;
    $('toggleTree').textContent = treeExpanded ? 'Collapse all' : 'Expand all';
    renderTree();
  });

  (async () => {
    try {
      await hydrateSavedPlanClasses();
    } catch (_) {
      /* Public ESI may be temporarily unavailable. */
    }
    renderSavedFitPlans();
    const query = new URLSearchParams(location.search);
    if (query.get('error'))
      return showError(query.get('error_description') || query.get('error'));
    try {
      if (query.get('code')) await exchangeCode(query.get('code'));
      if (
        sessionStorage.getItem('eve_access_token') ||
        sessionStorage.getItem('eve_refresh_token')
      )
        await loadAssets();
    } catch (error) {
      history.replaceState({}, document.title, redirectUri);
      logout();
      showError(error.message || String(error));
    }
  })();
})();
