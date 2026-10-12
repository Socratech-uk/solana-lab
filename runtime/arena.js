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
    // This package has no network implementation.
    const url = () => fail('OFFLINE', 'This Sidecar is local-only');
    const fetchJson = url, bound = (result, input, fields) => { if (!object(result)) fail('RESPONSE', 'Invalid provider result'); for (const k of fields) if (input[k] && result[k] !== input[k]) fail('BINDING', `Provider result does not match ${k}`); return result; };
    const adapter = url;
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
  const ID = "uk.capp.sidecar.solana-arena";
  if (window.__CAPP_SOLANA_ARENA_INSTALLED__) return;
  const plan = window.__CAPP_EXECUTABLE_PLAN__ || {};
  const selected = (
    Array.isArray(plan.library?.selected) ? plan.library.selected : []
  ).find((x) => x?.id === ID);
  if (!selected) return;
  const config = {
    ...{
      providerMode: "deterministic-local",
      failureMode: "none",
      latencyMs: 0,
      feeLamports: 5000,
      finality: "simulated-finalised",
      maxOperations: 128,
      syntheticEntryPrice: 100,
      maxPositions: 64,
    },
    ...(selected.config || {}),
  };
  const rt = makeRuntime({
    component: "arena",
    plan,
    config,
    modes: ["deterministic-local"],
    storeKey: "capp.solana-arena.outcomes.v2",
    storeProtocol: "capp.solana-arena.store.v2",
    collections: { outcomes: "maxOperations", positions: "maxPositions" },
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

  const execute = rt.guard(async (input = {}) => {
    if (input.network && input.network !== "demo")
      fail("DEMO_ONLY", "Arena executes only simulated operations");
    const operationId = id(input.operationId, "Operation ID"),
      messageDigest = hex(input.messageDigest, "Message digest"),
      store = load();
    const attemptId = id(
      input.attemptId ||
        "attempt_" +
          (await digest({ operationId, messageDigest })).slice(0, 24),
      "Attempt ID",
    );
    const requestDigest = await digest({
        ...input,
        operationId,
        messageDigest,
        attemptId,
        network: "demo",
      }),
      old = store.outcomes[operationId];
    if (old) {
      if (old.requestDigest !== requestDigest)
        fail(
          "ID_CONFLICT",
          "This operation is already bound to a different Arena request",
        );
      return clone(old);
    }
    const failure = String(config.failureMode);
    if (!["none", "reject", "expire", "drop-response"].includes(failure))
      fail("CONFIG", "Unsupported Arena failure scenario");
    if (
      !["simulated-finalised", "simulated-confirmed"].includes(config.finality)
    )
      fail("CONFIG", "Arena finality must be explicitly simulated");
    const latency = number(config.latencyMs, "Latency", 0, 30000);
    if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
    const now = Date.now() / 1000,
      action = String(
        input.action || input.sendIntent || "transaction",
      ).toLowerCase(),
      clientPositionId = id(
        input.clientPositionId || input.positionId,
        "Position ID",
        true,
      );
    const attemptDigest = await digest({
      operationId,
      attemptId,
      messageDigest,
      requestDigest,
      provider: "arena-deterministic-v2",
    });
    let row = {
      protocol: "capp.solana-arena.outcome.v2",
      operationId,
      attemptId,
      messageDigest,
      requestDigest,
      transactionDigest: String(input.transactionDigest || attemptDigest),
      provider: "arena-deterministic-v2",
      network: "demo",
      simulated: true,
      fundsMoved: false,
      mockFundsMoved: false,
      feeLamports: number(config.feeLamports, "Simulated fee"),
      signature: null,
      state: "submitted",
      observedState: "submitted",
      finality: "none",
      failureMode: failure,
      action,
      clientPositionId,
      updatedAt: now,
    };
    if (["reject", "expire"].includes(failure)) {
      const state = failure === "reject" ? "rejected" : "expired";
      row = {
        ...row,
        state,
        observedState: state,
        error: {
          code: failure === "reject" ? "ARENA_REJECTED" : "ARENA_EXPIRED",
          message: `Simulated ${state} outcome`,
        },
      };
      store.outcomes[operationId] = row;
      save(store);
      return clone(row);
    }
    const opens = ["open", "signal_open"],
      increases = ["increase", "increase_or_open"],
      closes = [
        "close",
        "risk_exit",
        "stop_loss",
        "take_profit",
        "trailing_stop",
        "max_hold",
        "manual_force",
        "emergency_close",
        "liquidate",
      ],
      reduces = ["reduce", "reduce_only"];
    const isOpen = opens.includes(action),
      isIncrease = increases.includes(action),
      isClose = closes.includes(action),
      isReduce = reduces.includes(action);
    if (
      !isOpen &&
      !isIncrease &&
      !isClose &&
      !isReduce &&
      action !== "transaction"
    )
      fail("ACTION", "Unsupported Arena action");
    let position = null,
      settlement = null,
      executionStatus = "arena_transaction_finalised";
    if (isOpen || isIncrease || isClose || isReduce) {
      if (!clientPositionId)
        fail("POSITION", "A position action requires clientPositionId");
      const prior = store.positions[clientPositionId];
      if (isOpen || isIncrease) {
        const size = number(
            input.size ?? input.notionalUsd ?? 1,
            "Position size",
            Number.MIN_VALUE,
            1e15,
            false,
          ),
          price = number(
            input.price ?? config.syntheticEntryPrice,
            "Entry price",
            Number.MIN_VALUE,
            1e15,
            false,
          );
        if (prior && (!isIncrease || prior.state !== "open"))
          fail(
            "POSITION_EXISTS",
            "Position ID already exists; increase an open position or use a new ID",
          );
        const market = String(
            input.market || input.marketPair || prior?.market || "",
          ),
          side = String(input.side || input.positionSide || prior?.side || "");
        if (prior && (market !== prior.market || side !== prior.side))
          fail("ID_CONFLICT", "Position market and side cannot change");
        position = {
          protocol: "capp.solana-arena.position.v1",
          clientPositionId,
          market,
          side,
          size: (prior?.size || 0) + size,
          entryPrice: prior
            ? (prior.size * prior.entryPrice + size * price) /
              (prior.size + size)
            : price,
          state: "open",
          openedByOperationId: prior?.openedByOperationId || operationId,
          updatedAt: now,
        };
        executionStatus = "arena_position_open";
      } else {
        if (!prior || prior.state !== "open")
          fail(
            "POSITION_NOT_FOUND",
            "Close or reduce requires an open simulated position",
          );
        const reduction = isReduce
          ? number(
              input.reduceSize ?? input.size,
              "Reduction size",
              Number.MIN_VALUE,
              prior.size,
              false,
            )
          : prior.size;
        const remaining = prior.size - reduction,
          closed = remaining === 0;
        position = {
          ...prior,
          size: remaining,
          state: closed ? "closed" : "open",
          ...(closed ? { closedByOperationId: operationId } : {}),
          updatedAt: now,
        };
        executionStatus = closed
          ? "arena_position_closed_and_swept"
          : "arena_position_reduced";
        if (closed)
          settlement = {
            closeConfirmed: true,
            fundsReturnedToRail: true,
            sweepConfirmed: true,
            fundsSwept: true,
            railBucketState: "reusable",
            simulated: true,
          };
      }
    }
    row = {
      ...row,
      signature: "demo_" + attemptDigest,
      state:
        config.finality === "simulated-finalised" ? "finalised" : "confirmed",
      observedState:
        config.finality === "simulated-finalised" ? "finalised" : "confirmed",
      finality: config.finality,
      mockFundsMoved: true,
      executionStatus,
      settlement,
      position: position ? clone(position) : null,
      operationEvidencePacket: {
        submittedOnExecutionPlane: true,
        venuePositionCreated: !!position && position.state === "open",
        closeConfirmed: !!settlement?.closeConfirmed,
        sweepConfirmed: !!settlement?.sweepConfirmed,
        shouldAdvanceState: true,
        missing: [],
        simulated: true,
      },
    };
    store.outcomes[operationId] = row;
    if (position) store.positions[clientPositionId] = position;
    save(store);
    if (failure === "drop-response")
      fail(
        "RESPONSE_DROPPED",
        "Simulated response lost after execution. Read this operation to recover its recorded outcome",
      );
    return clone(row);
  });
  const read = rt.guard(async (input = {}) => {
    const row = load().outcomes[id(input.operationId, "Operation ID")];
    if (!row) fail("NOT_FOUND", "Arena outcome not found");
    rt.bound(row, input, ["attemptId", "signature", "messageDigest"]);
    return clone(row);
  });
  const position = rt.guard(async (input = {}) => {
    const row =
      load().positions[
        id(input.clientPositionId || input.positionId, "Position ID")
      ];
    if (!row) fail("POSITION_NOT_FOUND", "Arena position not found");
    return clone(row);
  });
  const evidenceTransfer = rt.guard(async (input={}) => {
    const outcome = load().outcomes[id(input.operationId,'Operation ID')];
    if(!outcome) fail('NOT_FOUND','Arena outcome not found');
    rt.bound(outcome,input,['attemptId']);
    if(outcome.state !== 'finalised') fail('STATE','Record a successful Arena outcome before proposing evidence');
    const original = rt.number(input.originalAmountLamports,'Original SOL lamports',1);
    const divisor = rt.number(input.divisor ?? 10000,'Scale divisor',1);
    const amount = Number(BigInt(original)/BigInt(divisor));
    const remainder = Number(BigInt(original)%BigInt(divisor));
    if(amount < 1) fail('SCALING','The scaled amount rounds to zero lamports; choose a larger nominal SOL amount');
    const evidence = {protocol:'capp.solana-arena.scaled-evidence.v1',simulated:true,asset:'SOL',
      operationId:outcome.operationId,attemptId:outcome.attemptId,outcome,
      originalAmountLamports:original,divisor,amountLamports:amount,rounding:'floor',roundingRemainderLamports:remainder};
    return {...evidence,evidenceDigest:await digest(evidence),requiresSeparateTransfer:true};
  });
  const statusFields = async () => ({
    network: "demo",
    simulated: true,
    networkAccess: false,
    failureMode: String(config.failureMode),
    latencyMs: Number(config.latencyMs),
    feeLamports: Number(config.feeLamports),
    finality: config.finality,
    positionLifecycle: true,
  });

  const status = async () => ({
    protocol: "capp.solana-component.status.v1",
    sidecarId: ID,
    component: "arena",
    providerMode: String(config.providerMode),
    network: config.network || null,
    ...rt.health(),
    ...(await statusFields()),
  });

  const api = Object.freeze({
    protocol: "capp.solana-arena.api.v2",
    status,
    execute,
    read,
    position,
    evidenceTransfer,
  });
  window.capp = window.capp || {};
  window.capp.solana = window.capp.solana || {};
  window.capp.solana.arena = api;
  window.__CAPP_SOLANA_ARENA_INSTALLED__ = true;
  if (typeof document !== "undefined")
    document
      .querySelectorAll("[data-capp-solana-arena]")
      .forEach((el) =>
        rt.panel(
          el,
          "Solana Arena",
          "Exercise payments, position changes and lost responses without network access. Repeating the same request returns its recorded outcome.",
          status,
        ),
      );
  const detail = {
    protocol: "capp.solana-component.runtime.v2",
    id: ID,
    component: "arena",
    api: "window.capp.solana.arena",
  };
  try {
    window.dispatchEvent(
      new CustomEvent("capp:solana-arena-ready", { detail }),
    );
    window.dispatchEvent(new CustomEvent("capp:sidecar-ready", { detail }));
  } catch (_) {}
})();
