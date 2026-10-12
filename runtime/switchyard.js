(() => {
  "use strict";
  // BEGIN GENERATED SOLANA COMMON
  // Shared source; embedded into each independently selectable Solana shell.
  const makeRuntime = ({
    component,
    plan,
    config,
    modes,
    storeKey = "",
    storeProtocol = "",
    collections = {},
  }) => {
    const code = `CAPP_SOLANA_${component.toUpperCase()}`;
    const fail = (suffix, message, detail) => {
      throw Object.assign(new Error(message), {
        code: suffix.startsWith("CAPP_") ? suffix : `${code}_${suffix}`,
        detail,
      });
    };
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const object = (v) =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    const stable = (v) =>
      Array.isArray(v)
        ? v.map(stable)
        : object(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, stable(v[k])]),
            )
          : v;
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const shaBytes = async (bytes) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const digest = (v) =>
      shaBytes(
        new TextEncoder().encode(
          typeof v === "string" ? v : JSON.stringify(stable(v)),
        ),
      );
    const id = (v, label = "Identifier", optional = false) => {
      const s = String(v == null ? "" : v).trim();
      if (
        (!s && !optional) ||
        s.length > 256 ||
        /[\u0000-\u001f]/.test(s) ||
        ["__proto__", "prototype", "constructor"].includes(s)
      )
        fail(
          "IDENTITY",
          `${label} must be a non-empty identifier of at most 256 characters`,
        );
      return s;
    };
    const hex = (v, label = "Digest", optional = false) => {
      const s = String(v || "").toLowerCase();
      if (optional && !s) return "";
      if (!/^[a-f0-9]{64}$/.test(s))
        fail("DIGEST", `${label} must be a SHA-256 digest`);
      return s;
    };
    const number = (
      v,
      label,
      min = 0,
      max = Number.MAX_SAFE_INTEGER,
      integer = true,
    ) => {
      if (
        (typeof v !== "number" && typeof v !== "string") ||
        v === "" ||
        (typeof v === "string" && !v.trim())
      )
        fail("NUMBER", `${label} must be a number`);
      const n = Number(v);
      if (
        !Number.isFinite(n) ||
        n < min ||
        n > max ||
        (integer && !Number.isSafeInteger(n))
      )
        fail(
          "NUMBER",
          `${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`,
        );
      return n;
    };
    const b64bytes = (value) => {
      const s = String(value || "").trim();
      if (
        !s ||
        s.length > 2_000_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          s,
        )
      )
        fail("MESSAGE_BYTES", "Expected non-empty, padded base64 bytes");
      try {
        return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      } catch (_) {
        return fail("MESSAGE_BYTES", "Invalid base64 bytes");
      }
    };
    const transaction = (encoded) => {
      const bytes = b64bytes(encoded);
      // Solana wire format: shortvec signature count, 64-byte signatures, message.
      let count = 0,
        shift = 0,
        offset = 0,
        b;
      do {
        if (offset >= bytes.length || offset >= 3)
          fail("TRANSACTION", "Invalid transaction signature count");
        b = bytes[offset++];
        count |= (b & 127) << shift;
        shift += 7;
      } while (b & 128);
      const signatureOffset = offset,
        messageOffset = offset + count * 64;
      if (count < 1 || count > 64 || messageOffset + 3 >= bytes.length)
        fail("TRANSACTION", "A complete signed transaction is required");
      const message = bytes.slice(messageOffset),
        header = message[0] & 128 ? 1 : 0;
      if ((header && message[0] !== 128) || message[header] !== count)
        fail(
          "TRANSACTION",
          "Transaction signature count does not match its message",
        );
      for (let i = 0; i < count; i++)
        if (
          bytes
            .slice(signatureOffset + i * 64, signatureOffset + (i + 1) * 64)
            .every((v) => v === 0)
        )
          fail("TRANSACTION", "Transaction contains an empty signature");
      const signature = bytes.slice(signatureOffset, signatureOffset + 64),
        alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let n = 0n,
        text = "";
      for (const v of signature) n = n * 256n + BigInt(v);
      while (n) {
        text = alphabet[Number(n % 58n)] + text;
        n /= 58n;
      }
      for (const v of signature) {
        if (v !== 0) break;
        text = "1" + text;
      }
      return { bytes, message, signature: text };
    };
    const mode = () => {
      const v = String(config.providerMode);
      if (!modes.includes(v))
        fail("MODE", `Unsupported ${component} provider mode: ${v}`);
      return v;
    };
    const network = (input = {}, expected = config.network) => {
      const n = String(input.network || expected || "demo");
      if (!["demo", "devnet", "testnet", "mainnet-beta"].includes(n))
        fail("NETWORK", "Unsupported Solana network");
      if (expected && n !== expected)
        fail(
          "NETWORK_MISMATCH",
          `This provider is configured for ${expected}, not ${n}`,
        );
      return n;
    };
    // BEGIN NETWORK HELPERS
    const url = (value) => {
      let u;
      try {
        u = new URL(String(value || "").trim());
      } catch (_) {
        return fail("URL", "Configure an absolute HTTPS endpoint");
      }
      if (
        u.username ||
        u.password ||
        u.hash ||
        (u.protocol !== "https:" &&
          !(
            u.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
          ))
      )
        fail(
          "URL",
          "Use HTTPS, or loopback HTTP, without embedded credentials or a fragment",
        );
      return u.href;
    };
    const fetchJson = async (endpoint, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(
          1000,
          Math.min(120000, Number(config.requestTimeoutMs) || 12000),
        ),
      );
      try {
        const res = await fetch(url(endpoint), {
          ...options,
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          redirect: "error",
        });
        const ceiling = 2_000_000;
        if (Number(res.headers?.get("content-length") || 0) > ceiling)
          fail("RESPONSE_LIMIT", "Provider response exceeds 2 MB");
        let text = "";
        if (res.body?.getReader) {
          const reader = res.body.getReader(),
            chunks = [];
          let size = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > ceiling) {
                await reader.cancel();
                fail("RESPONSE_LIMIT", "Provider response exceeds 2 MB");
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          text = new TextDecoder().decode(bytes);
        } else {
          text = await res.text();
          if (text.length > ceiling)
            fail("RESPONSE_LIMIT", "Provider response exceeds 2 MB");
        }
        if (!res.ok) {
          const retry = Math.min(120, Math.max(1, Number(res.headers?.get("retry-after")) || 10));
          const hint = res.status === 401 || res.status === 403
            ? " Check the endpoint, client token and provider access rules for this app."
            : res.status === 429 ? ` Wait ${retry} seconds before trying again.` : "";
          fail("HTTP", `Provider returned HTTP ${res.status}.${hint}`, {
            httpStatus: res.status, ...(res.status === 429 ? {retryAfterSeconds: retry} : {}),
          });
        }
        let result;
        try {
          result = JSON.parse(text);
        } catch (_) {
          fail("JSON", "Provider returned invalid JSON");
        }
        if (!object(result)) fail("JSON", "Provider response must be an object");
        return result;
      } catch (error) {
        if (String(error?.code || "").startsWith("CAPP_")) throw error;
        if (controller.signal.aborted || error?.name === "AbortError")
          fail("TIMEOUT", "The provider did not respond before the request timeout. Check the connection and retry the read; reconcile a submitted transaction.");
        fail("FETCH", "No provider response was available. Check your connection, endpoint and browser/provider access rules (including CORS).", {responseReceived: false});
      } finally {
        clearTimeout(timeout);
      }
    };
    const bound = (result, input, fields) => {
      if (!object(result))
        fail("RESPONSE", "Provider returned an invalid result");
      for (const key of fields)
        if (input[key] != null && input[key] !== "" && result[key] !== input[key])
          fail("BINDING", `Provider result does not match ${key}`);
      return result;
    };
    const adapter = async (action, input = {}) => {
      const data = await fetchJson(config.externalAdapterUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          protocol: "capp.solana-sidecar-adapter.v1",
          component,
          action,
          network: config.network || input.network || "demo",
          input,
        }),
      });
      if (data.ok === false || data.error)
        fail(
          "ADAPTER_REJECTED",
          "Provider rejected the request",
          data.error || null,
        );
      const result = own(data, "result") ? data.result : data;
      return bound(result, input, [
        "operationId",
        "attemptId",
        "requestId",
        "groupId",
        "railId",
        "network",
        "messageDigest",
        "policyDigest",
      ]);
    };
    // END NETWORK HELPERS
    const scope = JSON.stringify([
      String(
        plan.projectId || plan.project?.id || plan.appId || plan.app?.id || "app",
      ),
      String(plan.componentId || "main"),
      String(plan.appId || plan.app?.id || "app"),
      String(config.network || "local"),
    ]);
    const key = storeKey ? `${storeKey}:scope:${encodeURIComponent(scope)}` : "";
    const blank = () => ({
      protocol: storeProtocol,
      scope,
      ...Object.fromEntries(Object.keys(collections).map((c) => [c, {}])),
    });
    const load = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          const old = localStorage.getItem(storeKey);
          if (old !== null) {
            let legacy;
            try {
              legacy = JSON.parse(old);
            } catch (_) {
              fail(
                "LEGACY_STATE",
                "Earlier unscoped data is unreadable. Preserve it for recovery before using this workspace.",
              );
            }
            if (
              !object(legacy) ||
              legacy.protocol !== storeProtocol ||
              Object.keys(collections).some(
                (c) => !object(legacy[c]) || Object.keys(legacy[c]).length,
              )
            )
              fail(
                "LEGACY_STATE",
                "Earlier unscoped data needs review. Export and reconcile it before clearing its old storage key; see the Solana Sidecars recovery guide.",
              );
          }
          return blank();
        }
        const value = JSON.parse(raw);
        if (
          !object(value) ||
          value.protocol !== storeProtocol ||
          value.scope !== scope ||
          Object.keys(collections).some(
            (c) =>
              !object(value[c]) ||
              Object.values(value[c]).some(
                (r) => !object(r) && !Array.isArray(r),
              ),
          )
        )
          fail(
            "STORAGE_CORRUPT",
            "Saved state is invalid. Existing records have been preserved; restore a verified backup.",
          );
        return value;
      } catch (e) {
        if (e.code) throw e;
        fail(
          "STORAGE_UNAVAILABLE",
          "Saved state could not be read. Existing records have been preserved.",
        );
      }
    };
    const save = (store) => {
      for (const [name, setting] of Object.entries(collections)) {
        const cap =
          typeof setting === "number"
            ? setting
            : number(config[setting] ?? 256, setting, 1, 4096);
        if (Object.keys(store[name]).length > cap)
          fail(
            "CAPACITY",
            `The ${name} record limit has been reached. Existing records are retained; increase the limit or archive and reconcile this workspace.`,
          );
      }
      const raw = JSON.stringify(store);
      if (raw.length > 4_000_000)
        fail(
          "CAPACITY",
          "The local record store is full. Existing records are retained.",
        );
      try {
        localStorage.setItem(key, raw);
      } catch (_) {
        fail(
          "STORAGE_WRITE",
          "Could not save state. Free storage before continuing.",
        );
      }
    };
    let tail = Promise.resolve();
    const guard =
      (fn) =>
      (...args) => {
        // Snapshot now: callers cannot change a queued request while it waits for its lock.
        let input;
        try {
          const json = JSON.stringify(args, (k, v) => {
            if (typeof v === "number" && !Number.isFinite(v))
              fail("NUMBER", "Non-finite numbers are not valid request data");
            return v;
          });
          if (json.length > 2_500_000)
            fail("INPUT_LIMIT", "Request exceeds the local input limit");
          input = JSON.parse(json);
        } catch (e) {
          return Promise.reject(e);
        }
        const run = () => {
          mode();
          const locks = typeof navigator !== "undefined" && navigator.locks;
          return storeKey && locks?.request
            ? locks.request(key, () => fn(...input))
            : fn(...input);
        };
        const next = tail.then(run, run);
        tail = next.catch(() => {});
        return next;
      };
    const health = () => {
      let error = null,
        provider = String(config.providerMode),
        configured = false;
      try {
        mode();
        if (provider === "external-adapter") url(config.externalAdapterUrl);
        if (storeKey) load();
        configured = true;
      } catch (e) {
        error = { code: e.code, message: e.message };
      }
      return {
        ready: configured,
        configured,
        readiness: !configured
          ? "needs-setup"
          : provider === "external-adapter"
            ? "configured-unverified"
            : "local",
        connectionVerified: false,
        ...(storeKey
          ? {
              persistence: "browser-local-storage",
              storageScope: scope,
              concurrency:
                typeof navigator !== "undefined" && navigator.locks
                  ? "web-locks"
                  : "single-context",
              storageError: error,
            }
          : {}),
        ...(error ? { error } : {}),
      };
    };
    const peer = async (name, expectedNetwork) => {
      const api = window.capp?.solana?.[name];
      if (!api || typeof api.status !== "function")
        fail("PEER", `Add and configure Solana ${name}`);
      const s = await api.status();
      if (!s.ready || s.providerMode === "offline")
        fail("PEER", `Solana ${name} is not ready`);
      if (expectedNetwork && s.network !== expectedNetwork)
        fail(
          "NETWORK_MISMATCH",
          `Solana ${name} is configured for a different network`,
        );
      return api;
    };
    const exportRecords = () => {
      const data = {
        protocol: "capp.solana-local-backup.v1",
        component,
        scope,
        storageKey: key,
        scopedState: localStorage.getItem(key),
        legacyStorageKey: storeKey,
        legacyState: localStorage.getItem(storeKey),
        exportedAt: new Date().toISOString(),
      };
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = href;
      link.download = `solana-${component}-records.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    };
    const panel = (element, name, description, status) => {
      element.innerHTML = `<section class="capp-solana-component"><header><div><small>Solana Sidecar</small><h3></h3></div><span data-solana-${component}-status role="status"></span></header><p class="description"></p><dl><div><dt>Provider</dt><dd></dd></div><div><dt>Network</dt><dd></dd></div><div><dt>Availability</dt><dd></dd></div></dl><p class="runtime-note"></p><div class="actions"><button type="button">Refresh status</button>${storeKey ? '<button type="button" data-export-records>Export local records</button>' : ""}</div><p class="runtime-error" role="alert" hidden></p><details><summary>Technical details</summary><pre></pre></details></section>`;
      element.querySelector("h3").textContent = name;
      element.querySelector(".description").textContent = description;
      const render = async () => {
        const button = element.querySelector("button"),
          error = element.querySelector(".runtime-error");
        button.disabled = true;
        error.hidden = true;
        try {
          const s = await status(),
            fields = element.querySelectorAll("dd"),
            tag = element.querySelector('[role="status"]');
          const label = s.ready
            ? s.simulated ||
              s.providerMode === "demo-confirm" ||
              s.providerMode === "local-control"
              ? "Simulation"
              : s.readiness === "configured-unverified"
                ? "Configured · unverified"
                : "Available locally"
            : "Needs setup";
          tag.textContent = label;
          tag.dataset.state = s.ready ? "ready" : "unavailable";
          fields[0].textContent = String(
            s.providerMode || s.provider || "local",
          ).replaceAll("-", " ");
          fields[1].textContent = s.network || "Off-chain";
          fields[2].textContent = label;
          element.querySelector(".runtime-note").textContent =
            s.error?.message ||
            (s.connectionVerified === false &&
            ["external-adapter", "direct-rpc"].includes(s.providerMode)
              ? "Endpoint configured. Connection and provider behavior have not been verified."
              : s.persistence
                ? "Records stay in this app’s local storage. Export a backup before clearing app data."
                : "Status describes this component; transaction results are recorded separately.");
          element.querySelector("pre").textContent = JSON.stringify(s, null, 2);
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
        } finally {
          button.disabled = false;
        }
      };
      element.querySelector("button").onclick = render;
      const exportButton = element.querySelector("[data-export-records]");
      if (exportButton)
        exportButton.onclick = () => {
          const error = element.querySelector(".runtime-error");
          try {
            exportRecords();
          } catch (e) {
            error.textContent = `Could not export records: ${e.message}`;
            error.hidden = false;
          }
        };
      void render();
    };
    return {
      fail,
      own,
      object,
      stable,
      clone,
      digest,
      shaBytes,
      id,
      hex,
      number,
      b64bytes,
      transaction,
      mode,
      network,
      url,
      fetchJson,
      bound,
      adapter,
      load,
      save,
      guard,
      health,
      peer,
      panel,
      exportRecords,
      storageKey: key,
      scope,
    };
  };
  // END GENERATED SOLANA COMMON
  const ID = "uk.capp.sidecar.solana-switchyard";
  if (window.__CAPP_SOLANA_SWITCHYARD_INSTALLED__) return;
  const plan = window.__CAPP_EXECUTABLE_PLAN__ || {};
  const selected = (
    Array.isArray(plan.library?.selected) ? plan.library.selected : []
  ).find((x) => x?.id === ID);
  if (!selected) return;
  const config = {
    ...{
      providerMode: "local-allocation",
      maxBuckets: 128,
      requireUniqueExecutionWallet: true,
      externalAdapterUrl: "",
    },
    ...(selected.config || {}),
  };
  const rt = makeRuntime({
    component: "switchyard",
    plan,
    config,
    modes: ["local-allocation", "external-adapter"],
    storeKey: "capp.solana-switchyard.rails.v1",
    storeProtocol: "capp.solana-switchyard.store.v1",
    collections: { rails: "maxBuckets" },
  });
  const {
    fail,
    clone,
    digest,
    shaBytes,
    id,
    hex,
    number,
    load,
    save,
    adapter,
  } = rt;

  const states = {
    allocated: [
      "rail_wallet_needs_funding",
      "rail_wallet_funded",
      "position_request_created",
    ],
    rail_wallet_needs_funding: ["rail_wallet_funded"],
    rail_wallet_funded: ["position_request_created", "sweep_requested"],
    position_request_created: ["position_open_pending"],
    position_open_pending: ["position_open", "position_closed"],
    position_open: ["position_close_pending"],
    position_close_pending: ["position_closed"],
    position_closed: ["sweep_requested"],
    sweep_requested: ["rail_bucket_reusable"],
    rail_bucket_reusable: [],
  };
  const allocate = rt.guard(async (input = {}) => {
    if (rt.mode() === "external-adapter") return adapter("allocate", input);
    const scope = {
      profileId: String(input.profileId || ""),
      vaultId: String(input.vaultId || ""),
      clientPositionId: id(input.clientPositionId, "Client position ID"),
      market: String(input.market || input.marketPair || ""),
      side: String(input.side || input.positionSide || ""),
    };
    const allocationKey = await digest(scope),
      store = load(),
      wallet = String(input.executionWallet || input.walletPubkey || "").trim(),
      existing = Object.values(store.rails).find(
        (x) => x.allocationKey === allocationKey,
      );
    if (existing) {
      if ((existing.executionWallet || "") !== wallet)
        fail(
          "ID_CONFLICT",
          "This position is already bound to a different execution wallet",
        );
      return { ...clone(existing), idempotent: true };
    }
    if (wallet && config.requireUniqueExecutionWallet !== false) {
      const busy = Object.values(store.rails).find(
        (x) =>
          x.executionWallet === wallet && x.state !== "rail_bucket_reusable",
      );
      if (busy)
        fail(
          "WALLET_IN_USE",
          "Execution wallet is assigned to an active rail bucket",
          { railId: busy.railId },
        );
    }
    const now = Date.now() / 1000,
      state = wallet ? "allocated" : "rail_wallet_needs_funding";
    const row = {
      protocol: "capp.solana-rail.v1",
      railId: "rail_" + allocationKey.slice(0, 24),
      allocationKey,
      ...scope,
      executionWallet: wallet || null,
      offChainAllocation: true,
      state,
      fundsMoved: false,
      privateKeyIncluded: false,
      lifecycle: [{ event: "rail_allocated", state, at: now }],
      createdAt: now,
      updatedAt: now,
    };
    store.rails[row.railId] = row;
    save(store);
    return { ...clone(row), idempotent: false };
  });
  const read = rt.guard(async (input = {}) => {
    if (rt.mode() === "external-adapter") return adapter("read", input);
    const rows = Object.values(load().rails).filter((x) =>
      input.railId
        ? x.railId === input.railId
        : x.clientPositionId === input.clientPositionId &&
          (!input.profileId || x.profileId === input.profileId) &&
          (!input.vaultId || x.vaultId === input.vaultId),
    );
    if (rows.length !== 1)
      fail("NOT_FOUND", "Identify exactly one rail bucket with railId");
    return clone(rows[0]);
  });
  const transition = rt.guard(async (input = {}) => {
    if (rt.mode() === "external-adapter") return adapter("transition", input);
    const store = load(),
      row = store.rails[id(input.railId, "Rail ID")];
    if (!row) fail("NOT_FOUND", "Rail bucket not found");
    const state = String(input.state || "");
    if (
      !rt.own(states, state) ||
      (row.state !== state && !states[row.state]?.includes(state))
    )
      fail("STATE", `Cannot move from ${row.state} to ${state}`);
    if (row.state === state) return clone(row);
    const evidenceDigest = hex(
      input.evidenceDigest,
      "Lifecycle evidence digest",
      true,
    );
    if (
      [
        "rail_wallet_funded",
        "position_open",
        "position_closed",
        "rail_bucket_reusable",
      ].includes(state) &&
      !evidenceDigest
    )
      fail("EVIDENCE", "This lifecycle transition requires evidenceDigest");
    if (row.lifecycle.length >= 128)
      fail("CAPACITY", "Rail history is full; records are retained");
    const now = Date.now() / 1000;
    row.state = state;
    row.updatedAt = now;
    row.lifecycle.push({
      event: String(input.event || state),
      state,
      evidenceDigest,
      at: now,
    });
    if (state === "rail_bucket_reusable") row.releasedAt = now;
    save(store);
    return clone(row);
  });
  const manifest = rt.guard(async () => {
    if (rt.mode() === "external-adapter") return adapter("manifest", {});
    const rows = Object.values(load().rails);
    return {
      protocol: "capp.solana-switchyard.manifest.v1",
      active: rows.filter((x) => x.state !== "rail_bucket_reusable"),
      reusable: rows.filter((x) => x.state === "rail_bucket_reusable"),
      privateKeys: 0,
      rawThresholdShares: 0,
    };
  });
  const statusFields = async () => ({
    offChainAllocationOnly: config.providerMode === "local-allocation",
    privateKeyAccess: false,
    fundsMovement: false,
    requireUniqueExecutionWallet: config.requireUniqueExecutionWallet !== false,
  });

  const status = async () => ({
    protocol: "capp.solana-component.status.v1",
    sidecarId: ID,
    component: "switchyard",
    providerMode: String(config.providerMode),
    network: config.network || null,
    ...rt.health(),
    ...(await statusFields()),
  });

  const api = Object.freeze({
    protocol: "capp.solana-switchyard.api.v1",
    status,
    allocate,
    read,
    transition,
    manifest,
  });
  window.capp = window.capp || {};
  window.capp.solana = window.capp.solana || {};
  window.capp.solana.switchyard = api;
  window.__CAPP_SOLANA_SWITCHYARD_INSTALLED__ = true;
  if (typeof document !== "undefined")
    document
      .querySelectorAll("[data-capp-solana-switchyard]")
      .forEach((el) =>
        rt.panel(
          el,
          "Solana Switchyard",
          "Assign positions to off-chain execution buckets and track their lifecycle. Reuse follows a recorded close and sweep.",
          status,
        ),
      );
  const detail = {
    protocol: "capp.solana-component.runtime.v1",
    id: ID,
    component: "switchyard",
    api: "window.capp.solana.switchyard",
  };
  try {
    window.dispatchEvent(
      new CustomEvent("capp:solana-switchyard-ready", { detail }),
    );
    window.dispatchEvent(new CustomEvent("capp:sidecar-ready", { detail }));
  } catch (_) {}
})();
