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
  // BEGIN GENERATED SOLANA WIRE
var SolanaWire=(()=>{var Et=Object.defineProperty;var Ra=Object.getOwnPropertyDescriptor;var ga=Object.getOwnPropertyNames;var Ea=Object.prototype.hasOwnProperty;var Sa=(e,t)=>{for(var n in t)Et(e,n,{get:t[n],enumerable:!0})},ma=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of ga(t))!Ea.call(e,o)&&o!==n&&Et(e,o,{get:()=>t[o],enumerable:!(r=Ra(t,o))||r.enumerable});return e};var Oa=e=>ma(Et({},"__esModule",{value:!0}),e);var AA={};Sa(AA,{ASSOCIATED_TOKEN:()=>he,DEVNET_GENESIS:()=>aa,GENESIS:()=>Te,MEMO:()=>j,SYSTEM:()=>Y,TOKEN:()=>$,addressBytes:()=>ia,assetDescriptor:()=>ar,atomic:()=>ue,b64:()=>oe,createExportableWallet:()=>q_,createWallet:()=>Z_,formatAmount:()=>or,importWallet:()=>eA,inspect:()=>sa,inspectTransfer:()=>ua,mintAccount:()=>_a,parseAmount:()=>nA,paymentReference:()=>iA,paymentRequest:()=>la,precision:()=>We,privateKeyBytes:()=>J_,publicKey:()=>X,referenceFromDigest:()=>sA,referenceKeys:()=>$e,sign:()=>tA,tokenAccount:()=>er,tokenAddress:()=>ft,tokenLimit:()=>oA,tokenTransfer:()=>ca,tokenTransferAccounts:()=>rA,transactionMessage:()=>nr,transfer:()=>rr,transferSummary:()=>aA,unb64:()=>U,verify:()=>_A,verifyPaymentTransaction:()=>dA,walletSecret:()=>Q_});var Na=1,Ia=2,Ta=3,St=4,mt=5,sr=6,cr=7,ur=8,dr=9,ha=10,pa=11,Ca=12,Da=13,La=14,va=-32700,ya=-32603,wa=-32602,ba=-32601,Ma=-32600,xa=-32021,Ua=-32020,Pa=-32019,za=-32018,Ba=-32017,ka=-32016,Fa=-32015,Va=-32014,Ga=-32013,Wa=-32012,$a=-32011,Ha=-32010,Ka=-32009,Ya=-32008,ja=-32007,Xa=-32006,Za=-32005,qa=-32004,Ja=-32003,Qa=-32002,ei=-32001,pe=28e5,Ce=2800001,ti=2800002,Ot=2800003,_r=2800004,Ar=2800005,Nt=2800006,It=2800007,He=2800008,Tt=2800009,lr=2800010,fr=2800011,ni=323e4,ri=32300001,oi=3230002,ai=3230003,ii=3230004,ht=361e4,pt=3610001,Ct=3610002,Dt=3610003,Lt=3610004,vt=3610005,yt=3610006,Rr=3610007,wt=3611e3,bt=3704e3,Mt=3704001,gr=3704002,Er=3704003,xt=3704004,Sr=3704005,mr=3704006,si=3712e3,ci=4128e3,ui=4128001,di=4128002,_i=4615e3,Ai=4615001,li=4615002,fi=4615003,Ri=4615004,gi=4615005,Ei=4615006,Si=4615007,mi=4615008,Oi=4615009,Ni=4615010,Ii=4615011,Ti=4615012,hi=4615013,pi=4615014,Ci=4615015,Di=4615016,Li=4615017,vi=4615018,yi=4615019,wi=4615020,bi=4615021,Mi=4615022,xi=4615023,Ui=4615024,Pi=4615025,zi=4615026,Bi=4615027,ki=4615028,Fi=4615029,Vi=4615030,Gi=4615031,Wi=4615032,$i=4615033,Hi=4615034,Ki=4615035,Yi=4615036,ji=4615037,Xi=4615038,Zi=4615039,qi=4615040,Ji=4615041,Qi=4615042,es=4615043,ts=4615044,ns=4615045,rs=4615046,os=4615047,as=4615048,is=4615049,ss=4615050,cs=4615051,us=4615052,ds=4615053,_s=4615054,As=5508e3,ls=5508001,fs=5508002,Rs=5508003,gs=5508004,Es=5508005,Ss=5508006,ms=5508007,Os=5508008,Ns=5508009,Is=5508010,Ts=5508011,hs=5508012,ps=5607e3,Cs=5607001,Ds=5607002,Ls=5607003,vs=5607004,ys=5607005,ws=5607006,bs=5607007,Ms=5607008,xs=5607009,Us=5607010,Ps=5607011,zs=5607012,Bs=5607013,ks=5607014,Fs=5607015,Vs=5607016,Gs=5607017,Ws=5607018,$s=5607019,Ke=5663e3,fe=5663001,Ut=5663002,Pt=5663003,zt=5663004,Or=5663005,Nr=5663006,Ir=5663007,Tr=5663008,Bt=5663009,Hs=5663010,Ks=5663011,kt=5663012,Ys=5663013,js=5663014,Ft=5663015,Vt=5663016,Ye=5663017,Xs=5663018,Zs=5663019,hr=5663020,ae=5663021,pr=5663022,Gt=5663023,Wt=5663024,$t=5663025,Ht=5663026,Kt=5663027,Yt=5663028,Cr=5663029,Dr=5663030,Lr=5663031,De=5663032,Le=5663033,ve=5663034,ye=5663035,qs=5663036,Js=5663037,Qs=5663038,vr=5663039,yr=5663040,ec=5664e3,tc=5664001,nc=705e4,rc=7050001,oc=7050002,ac=7050003,ic=7050004,sc=7050005,cc=7050006,uc=7050007,dc=7050008,_c=7050009,Ac=7050010,lc=7050011,fc=7050012,Rc=7050013,gc=7050014,Ec=7050015,Sc=7050016,mc=7050017,Oc=7050018,Nc=7050019,Ic=7050020,Tc=7050021,hc=7050022,pc=7050023,Cc=7050024,Dc=7050025,Lc=7050026,vc=7050027,yc=7050028,wc=7050029,bc=7050030,Mc=7050031,xc=7050032,Uc=7050033,Pc=7050034,zc=7050035,Bc=7050036,kc=7618e3,Fc=7618001,Vc=7618002,Gc=7618003,Wc=7618004,$c=7618005,Hc=7618006,Kc=7618007,Yc=7618008,jc=7618009,Xc=7618010,Zc=7618011,jt=8078e3,Xt=8078001,Zt=8078002,wr=8078003,qt=8078004,Jt=8078005,Qt=8078006,en=8078007,tn=8078008,br=8078009,Mr=8078010,nn=8078011,we=8078012,rn=8078013,on=8078014,xr=8078015,Ur=8078016,an=8078017,sn=8078018,qc=8078019,Pr=8078020,zr=8078021,cn=8078022,Br=8078023,un=8078024,dn=8078025,kr=8078026,Fr=8078027,Jc=809e4,Qc=8090001,eu=8090002,tu=8090003,nu=8090004,ru=8090005,ou=8090006,au=8090007,iu=8090008,su=8090009,cu=8090010,uu=8090011,du=8090012,_u=81e5,Au=8100001,lu=8100002,fu=8100003,Ru=819e4,gu=8190001,Eu=8190002,Su=8190003,mu=8190004,Ou=8195e3,Nu=8195001,_n=85e5,An=8500001,ln=8500002,Vr=8500003,fn=8500004,Iu=8500005,Gr=8500006,Rn=8500007,Tu=89e5,hu=8900001,pu=8900002,Cu=8900003,Du=9e6,Lu=9000001,vu=9000002,yu=99e5,wu=9900001,bu=9900002,Wr=9900003,Mu=9900004,xu=9900005,Uu=9900006;function $r(e){return Array.isArray(e)?"%5B"+e.map($r).join("%2C%20")+"%5D":typeof e=="bigint"?`${e}n`:encodeURIComponent(String(e!=null&&Object.getPrototypeOf(e)===null?{...e}:e))}function Pu([e,t]){return`${e}=${$r(t)}`}function zu(e){let t=Object.entries(e).map(Pu).join("&");return btoa(t)}var fA={[ni]:"Account not found at address: $address",[ii]:"Not all accounts were decoded. Encoded accounts found at addresses: $addresses.",[ai]:"Expected decoded account at address: $address",[oi]:"Failed to decode account data at address: $address",[ri]:"Accounts not found at addresses: $addresses",[Tt]:"Unable to find a viable program address bump seed.",[ti]:"$putativeAddress is not a base58-encoded address.",[pe]:"Expected base58 encoded address to decode to a byte array of length 32. Actual length: $actualLength.",[Ot]:"The `CryptoKey` must be an `Ed25519` public key.",[fr]:"$putativeOffCurveAddress is not a base58-encoded off-curve address.",[He]:"Invalid seeds; point must fall off the Ed25519 curve.",[_r]:"Expected given program derived address to have the following format: [Address, ProgramDerivedAddressBump].",[Nt]:"A maximum of $maxSeeds seeds, including the bump seed, may be supplied when creating an address. Received: $actual.",[It]:"The seed at index $index with length $actual exceeds the maximum length of $maxSeedLength bytes.",[Ar]:"Expected program derived address bump to be in the range [0, 255], got: $bump.",[lr]:"Program address cannot end with PDA marker.",[Ce]:"Expected base58-encoded address string of length in the range [32, 44]. Actual length: $actualLength.",[St]:"Expected base58-encoded blockhash string of length in the range [32, 44]. Actual length: $actualLength.",[Na]:"The network has progressed past the last block for which this transaction could have been committed.",[jt]:"Codec [$codecDescription] cannot decode empty byte arrays.",[cn]:"Enum codec cannot use lexical values [$stringValues] as discriminators. Either remove all lexical values or set `useValuesAsDiscriminators` to `false`.",[Pr]:"Sentinel [$hexSentinel] must not be present in encoded bytes [$hexEncodedBytes].",[Jt]:"Encoder and decoder must have the same fixed size, got [$encoderFixedSize] and [$decoderFixedSize].",[Qt]:"Encoder and decoder must have the same max size, got [$encoderMaxSize] and [$decoderMaxSize].",[qt]:"Encoder and decoder must either both be fixed-size or variable-size.",[tn]:"Enum discriminator out of range. Expected a number in [$formattedValidDiscriminators], got $discriminator.",[Zt]:"Expected a fixed-size codec, got a variable-size one.",[rn]:"Codec [$codecDescription] expected a positive byte length, got $bytesLength.",[wr]:"Expected a variable-size codec, got a fixed-size one.",[qc]:"Codec [$codecDescription] expected zero-value [$hexZeroValue] to have the same size as the provided fixed-size item [$expectedSize bytes].",[Xt]:"Codec [$codecDescription] expected $expected bytes, got $bytesLength.",[sn]:"Expected byte array constant [$hexConstant] to be present in data [$hexData] at offset [$offset].",[br]:"Invalid discriminated union variant. Expected one of [$variants], got $value.",[Mr]:"Invalid enum variant. Expected one of [$stringValues] or a number in [$formattedNumericalValues], got $variant.",[xr]:"Invalid literal union variant. Expected one of [$variants], got $value.",[en]:"Expected [$codecDescription] to have $expected items, got $actual.",[we]:"Invalid value $value for base $base with alphabet $alphabet.",[kr]:"Invalid UTF-8 byte sequence at offset $offset.",[Fr]:"Invalid UTF-8 string. Found a lone surrogate at index $index.",[Ur]:"Literal union discriminator out of range. Expected a number between $minRange and $maxRange, got $discriminator.",[nn]:"Codec [$codecDescription] expected number to be in the range [$min, $max], got $value.",[on]:"Codec [$codecDescription] expected offset to be in the range [0, $bytesLength], got $offset.",[zr]:"Expected sentinel [$hexSentinel] to be present in decoded bytes [$hexDecodedBytes].",[an]:"Union variant out of range. Expected an index between $minRange and $maxRange, got $variant.",[Br]:"This decoder expected a byte array of exactly $expectedLength bytes, but $numExcessBytes unexpected excess bytes remained after decoding. Are you sure that you have chosen the correct decoder for this data?",[un]:"Invalid pattern match value. The provided value does not match any of the specified patterns.",[dn]:"Invalid pattern match bytes. The provided byte array does not match any of the specified patterns.",[wt]:"No random values implementation could be found.",[pa]:"Failed to send transaction$causeMessage",[Ca]:"Failed to send transactions$causeMessages",[Da]:"Failed to sign transaction$causeMessage",[La]:"Failed to sign transactions$causeMessages",[au]:"Fixed-point operation `$operation` of kind `$kind` overflowed. Expected a raw bigint in [$min, $max], got $result.",[su]:"Fixed-point division by zero for value of kind `$kind` ($signedness, $totalBits bits).",[tu]:"`fractionalBits` ($fractionalBits) must not exceed `totalBits` ($totalBits).",[eu]:"Invalid `decimals`. Expected a non-negative integer, got $decimals.",[Qc]:"Invalid `fractionalBits`. Expected a non-negative integer, got $fractionalBits.",[ru]:"Invalid string `$input` for fixed-point value of kind `$kind`.",[Jc]:"Invalid `totalBits`. Expected a positive integer, got $totalBits.",[ou]:"Invalid ratio $numerator/$denominator for fixed-point value of kind `$kind`. Denominator must be non-zero.",[uu]:"Fixed-point value of kind `$kind` has a malformed `raw` field. Expected a bigint, got `$raw`.",[iu]:"Fixed-point `$operation` operation expected $expectedKind ($expectedSignedness, $expectedTotalBits bits, $expectedScale $expectedScaleLabel); got $actualKind ($actualSignedness, $actualTotalBits bits, $actualScale $actualScaleLabel).",[cu]:"Fixed-point operation `$operation` of kind `$kind` cannot be performed exactly; pass a rounding mode other than `strict` to allow a rounded result.",[du]:"Fixed-point codec of kind `$kind` requires `totalBits` to be a multiple of 8; got $totalBits.",[nu]:"Fixed-point value of kind `$kind` is out of range for $signedness $totalBits-bit storage. Expected a raw bigint in [$min, $max], got $raw.",[si]:"Filesystem operation `$operation` is not supported in this environment.",[Oi]:"Instruction requires an uninitialized account",[xi]:"Instruction tries to borrow reference for an account which is already borrowed",[Ui]:"Instruction left account with an outstanding borrowed reference",[bi]:"Program other than the account's owner changed the size of the account data",[gi]:"Account data too small for instruction",[Mi]:"Instruction expected an executable account",[rs]:"An account does not have enough lamports to be rent-exempt",[as]:"Program arithmetic overflowed",[ns]:"Failed to serialize or deserialize account data",[_s]:"Builtin programs must consume compute units",[Wi]:"Cross-program invocation call depth too deep",[Xi]:"Computational budget exceeded",[zi]:"Custom program error: #$code",[Li]:"Instruction contains duplicate accounts",[Pi]:"Instruction modifications of multiply-passed account differ",[Vi]:"Executable accounts must be rent exempt",[ki]:"Instruction changed executable accounts data",[Fi]:"Instruction changed the balance of an executable account",[vi]:"Instruction changed executable bit of an account",[pi]:"Instruction modified data of an account it does not own",[hi]:"Instruction spent from the balance of an account it does not own",[Ai]:"Generic instruction error",[ss]:"Provided owner is not allowed",[es]:"Account is immutable",[ts]:"Incorrect authority provided",[Si]:"Incorrect program id for instruction",[Ei]:"Insufficient funds for instruction",[Ri]:"Invalid account data for instruction",[os]:"Invalid account owner",[li]:"Invalid program argument",[Bi]:"Program returned invalid error code",[fi]:"Invalid instruction data",[ji]:"Failed to reallocate account data",[Yi]:"Provided seeds do not result in a valid address",[cs]:"Accounts data allocations exceeded the maximum allowed per transaction",[us]:"Max accounts exceeded",[ds]:"Max instruction trace length exceeded",[Ki]:"Length of the seed is too long for address generation",[$i]:"An account required by the instruction is missing",[mi]:"Missing required signature for instruction",[Ti]:"Instruction illegally modified the program id of an account",[wi]:"Insufficient account keys for instruction",[Zi]:"Cross-program invocation with unauthorized signer or writable account",[qi]:"Failed to create program execution environment",[Qi]:"Program failed to compile",[Ji]:"Program failed to complete",[Di]:"Instruction modified data of a read-only account",[Ci]:"Instruction changed the balance of a read-only account",[Hi]:"Cross-program invocation reentrancy not allowed for this instruction",[yi]:"Instruction modified rent epoch of an account",[Ii]:"Sum of account balances before and after instruction do not match",[Ni]:"Instruction requires an initialized account",[_i]:"The instruction failed with the error: $errorName",[Gi]:"Unsupported program id",[is]:"Unsupported sysvar",[xu]:"Invalid instruction plan kind: $kind.",[Vc]:"The provided instruction plan is empty.",[$c]:"No failed transaction plan result was found in the provided transaction plan result.",[Wc]:"This transaction plan executor does not support non-divisible sequential plans. To support them, you may create your own executor such that multi-transaction atomicity is preserved \u2014 e.g. by targetting RPCs that support transaction bundles.",[Gc]:"The provided transaction plan failed to execute. See the `transactionPlanResult` attribute for more details. Note that the `cause` property is deprecated, and a future version will not set it.",[Zc]:"The configured maximum of $maxInstructions instructions per transaction is invalid. It must be a positive integer no greater than the transaction format limit of $transactionInstructionLimit instructions per transaction. Provide a `maxInstructionsPerTransaction` (on the transaction planner) or `maxInstructions` (on the message packer) value between 1 and $transactionInstructionLimit.",[Xc]:"Planning this transaction message would require $numInstructions instructions, which exceeds the configured maximum of $maxInstructions instructions per transaction. This limit is configurable, and intended to leave headroom for inner instructions which are included in the maximum instruction limit for transactions. Increase `maxInstructionsPerTransaction` on the transaction planner (or `maxInstructions` on the message packer) to allow more instructions per transaction.",[kc]:"The provided message has insufficient capacity to accommodate the next instruction(s) in this plan. Expected at least $numBytesRequired free byte(s), got $numFreeBytes byte(s).",[Uu]:"Invalid transaction plan kind: $kind.",[Fc]:"No more instructions to pack; the message packer has completed the instruction plan.",[Hc]:"Unexpected instruction plan. Expected $expectedKind plan, got $actualKind plan.",[Kc]:"Unexpected transaction plan. Expected $expectedKind plan, got $actualKind plan.",[Yc]:"Unexpected transaction plan result. Expected $expectedKind plan, got $actualKind plan.",[jc]:"Expected a successful transaction plan result. I.e. there is at least one failed or cancelled transaction in the plan.",[ci]:"The instruction does not have any accounts.",[ui]:"The instruction does not have any data.",[di]:"Expected instruction to have progress address $expectedProgramAddress, got $actualProgramAddress.",[mt]:"Expected base58 encoded blockhash to decode to a byte array of length 32. Actual length: $actualLength.",[Ia]:"The nonce `$expectedNonceValue` is no longer valid. It has advanced to `$actualNonceValue`",[bu]:"Invariant violation: Found no abortable iterable cache entry for key `$cacheKey`. It should be impossible to hit this error; please file an issue at https://sola.na/web3invariant",[Mu]:"Invariant violation: This data publisher does not publish to the channel named `$channelName`. Supported channels include $supportedChannelNames.",[wu]:"Invariant violation: WebSocket message iterator state is corrupt; iterated without first resolving existing message promise. It should be impossible to hit this error; please file an issue at https://sola.na/web3invariant",[yu]:"Invariant violation: WebSocket message iterator is missing state storage. It should be impossible to hit this error; please file an issue at https://sola.na/web3invariant",[Wr]:"Invariant violation: Switch statement non-exhaustive. Received unexpected value `$unexpectedValue`. It should be impossible to hit this error; please file an issue at https://sola.na/web3invariant",[ya]:"JSON-RPC error: Internal JSON-RPC error ($__serverMessage)",[wa]:"JSON-RPC error: Invalid method parameter(s) ($__serverMessage)",[Ma]:"JSON-RPC error: The JSON sent is not a valid `Request` object ($__serverMessage)",[ba]:"JSON-RPC error: The method does not exist / is not available ($__serverMessage)",[va]:"JSON-RPC error: An error occurred on the server while parsing the JSON text ($__serverMessage)",[Wa]:"$__serverMessage",[ei]:"$__serverMessage",[qa]:"$__serverMessage",[Va]:"$__serverMessage",[Ba]:"Epoch rewards period still active at slot $slot",[Ua]:"$__serverMessage",[Ha]:"$__serverMessage",[Ka]:"$__serverMessage",[Pa]:"Failed to query long-term storage; please try again",[ka]:"Minimum context slot has not been reached",[Za]:"Node is unhealthy; behind by $numSlotsBehind slots",[xa]:"No slot history",[Ya]:"No snapshot",[Qa]:"Transaction simulation failed",[za]:"Rewards cannot be found because slot $slot is not the epoch boundary. This may be due to gap in the queried node's local ledger or long-term storage",[ja]:"$__serverMessage",[$a]:"Transaction history is not available from this node",[Xa]:"$__serverMessage",[Ga]:"Transaction signature length mismatch",[Ja]:"Transaction signature verification failure",[Fa]:"$__serverMessage",[Sr]:"The grind regex `/$source/` contains the character `$character`, which is not in the base58 alphabet and can never match a Solana address.",[bt]:"Key pair bytes must be of length 64, got $byteLength.",[Mt]:"Expected private key bytes with length 32. Actual length: $actualLength.",[gr]:"Expected base58-encoded signature to decode to a byte array of length 64. Actual length: $actualLength.",[xt]:"The provided private key does not match the provided public key.",[Er]:"Expected base58-encoded signature string of length in the range [64, 88]. Actual length: $actualLength.",[mr]:"Writing a key pair to disk is not supported in this environment.",[sr]:"Lamports value must be in the range [0, 2e64-1]",[cr]:"`$value` cannot be parsed as a `BigInt`",[ha]:"$message",[ur]:"`$value` cannot be parsed as a `Number`",[Ta]:"No nonce account could be found at address `$nonceAccountAddress`",[Ls]:"Expected base58 encoded application domain to decode to a byte array of length 32. Actual length: $actualLength.",[Bs]:"Attempted to sign an offchain message with an address that is not a signer for it",[Ds]:"Expected base58-encoded application domain string of length in the range [32, 44]. Actual length: $actualLength.",[Ws]:"The content of the offchain message does not match the content that was expected. Expected content with a byte-length of $expectedBytes; got content with a byte-length of $actualBytes. The signer may have signed different data than was requested; do not trust its signature.",[zs]:"The signer addresses in this offchain message envelope do not match the list of required signers in the message preamble. These unexpected signers were present in the envelope: `[$unexpectedSigners]`. These required signers were missing from the envelope `[$missingSigners]`.",[ps]:"The message body provided has a byte-length of $actualBytes. The maximum allowable byte-length is $maxBytes",[bs]:"Expected message format $expectedMessageFormat, got $actualMessageFormat",[Ms]:"The message length specified in the message preamble is $specifiedLength bytes. The actual length of the message is $actualLength bytes.",[xs]:"Offchain message content must be non-empty",[ys]:"Offchain message must specify the address of at least one required signer",[Us]:"Offchain message envelope must reserve space for at least one signature",[vs]:"The offchain message preamble specifies $numRequiredSignatures required signature(s), got $signaturesLength.",[$s]:"The offchain message lists different required signatories than was expected. Expected [$expectedAddresses]. Got [$actualAddresses]. The signer may have signed different data than was requested; do not trust its signature.",[Fs]:"The signatories of this offchain message must be listed in lexicographical order",[Vs]:"An address must be listed no more than once among the signatories of an offchain message",[Ps]:"Offchain message is missing signatures for addresses: $addresses.",[Gs]:"Offchain message signature verification failed. Signature mismatch for required signatories [$signatoriesWithInvalidSignatures]. Missing signatures for signatories [$signatoriesWithMissingSignatures]",[Cs]:"The message body provided contains characters whose codes fall outside the allowed range. In order to ensure clear-signing compatiblity with hardware wallets, the message may only contain line feeds and characters in the range [\\x20-\\x7e].",[ks]:"Expected offchain message version $expectedVersion. Got $actualVersion.",[ws]:"This version of Kit does not support decoding offchain messages with version $unsupportedVersion. The current max supported version is 0.",[Gr]:"The provided account could not be identified as an account from the $programName program.",[ln]:"The provided instruction could not be identified as an instruction from the $programName program.",[_n]:"The provided instruction is missing some accounts. Expected at least $expectedAccountMetas account(s), got $actualAccountMetas.",[fn]:"Expected resolved instruction input '$inputName' to be non-null.",[Rn]:"Expected resolved instruction input '$inputName' to be a `TransactionSigner` because the instruction requires this account to sign the transaction. If its signature is provided by other means, use `createNoopSigner()` from `@solana/signers` to satisfy this requirement.",[Vr]:"Expected resolved instruction input '$inputName' to be of type `$expectedType`.",[Iu]:"Unrecognized account type '$accountType' for the $programName program.",[An]:"Unrecognized instruction type '$instructionType' for the $programName program.",[Ru]:"The notification name must end in 'Notifications' and the API must supply a subscription plan creator function for the notification '$notificationName'.",[Eu]:"WebSocket was closed before payload could be added to the send buffer",[Su]:"WebSocket connection closed",[mu]:"WebSocket failed to connect",[gu]:"Failed to obtain a subscription id from the server",[fu]:"Could not find an API plan for RPC method: `$method`",[_u]:"The $argumentLabel argument to the `$methodName` RPC method$optionalPathLabel was `$value`. This number is unsafe for use with the Solana JSON-RPC because it exceeds `Number.MAX_SAFE_INTEGER`.",[lu]:"HTTP error ($statusCode): $message",[Au]:"HTTP header(s) forbidden: $headers. Learn more at https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name.",[As]:"Multiple distinct signers were identified for address `$address`. Please ensure that you are using the same signer instance for each address.",[ls]:"The provided value does not implement the `KeyPairSigner` interface",[Rs]:"The provided value does not implement the `MessageModifyingSigner` interface",[gs]:"The provided value does not implement the `MessagePartialSigner` interface",[fs]:"The provided value does not implement any of the `MessageSigner` interfaces",[Ss]:"The provided value does not implement the `TransactionModifyingSigner` interface",[ms]:"The provided value does not implement the `TransactionPartialSigner` interface",[Os]:"The provided value does not implement the `TransactionSendingSigner` interface",[Es]:"The provided value does not implement any of the `TransactionSigner` interfaces",[Ns]:"More than one `TransactionSendingSigner` was identified.",[Is]:"No `TransactionSendingSigner` was identified. Please provide a valid `TransactionWithSingleSendingSigner` transaction.",[hs]:"The wallet account $address cannot be used to create a transaction signer because it does not implement either the `solana:signTransaction` or `solana:signAndSendTransaction` feature. At least one of these features is required. The account supports the following features: $supportedFeatures.",[Ts]:"Wallet account signers do not support signing multiple messages/transactions in a single operation",[Ou]:"This `ReactiveStreamStore` does not support retry. Use `createReactiveStoreFromDataPublisherFactory` to construct a retryable store.",[Nu]:"The stream store closed in an error state but did not report an error.",[Rr]:"Cannot export a non-extractable key.",[pt]:"No digest implementation could be found.",[ht]:"Cryptographic operations are only allowed in secure browser contexts. Read more here: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts.",[Ct]:`This runtime does not support the generation of Ed25519 key pairs.

Install @solana/webcrypto-ed25519-polyfill and call its \`install\` function before generating keys in environments that do not support Ed25519.

For a list of runtimes that currently support Ed25519 operations, visit https://github.com/WICG/webcrypto-secure-curves/issues/20.`,[Dt]:"No key export implementation could be found.",[Lt]:"No key generation implementation could be found.",[vt]:"No signing implementation could be found.",[yt]:"No signature verification implementation could be found.",[dr]:"Timestamp value must be in the range [-(2n ** 63n), (2n ** 63n) - 1]. `$value` given",[Sc]:"Transaction processing left an account with an outstanding borrowed reference",[rc]:"Account in use",[oc]:"Account loaded twice",[ac]:"Attempt to debit an account but found no record of a prior credit.",[pc]:"Transaction loads an address table account that doesn't exist",[uc]:"This transaction has already been processed",[dc]:"Blockhash not found",[_c]:"Loader call chain is too deep",[Ec]:"Transactions are currently disabled due to cluster maintenance",[bc]:"Transaction contains a duplicate instruction ($index) that is not allowed",[sc]:"Insufficient funds for fee",[Mc]:"Transaction results in an account ($accountIndex) with insufficient funds for rent",[cc]:"This account may not be used to pay transaction fees",[lc]:"Transaction contains an invalid account reference",[Dc]:"Transaction loads an address table account with invalid data",[Lc]:"Transaction address table lookup uses an invalid index",[Cc]:"Transaction loads an address table account with an invalid owner",[Uc]:"LoadedAccountsDataSizeLimit set for transaction must be greater than 0.",[Rc]:"This program may not be used for executing instructions",[vc]:"Transaction leaves an account with a lower balance than rent-exempt minimum",[Nc]:"Transaction loads a writable account that cannot be written",[xc]:"Transaction exceeded max loaded accounts data size cap",[Ac]:"Transaction requires a fee but has no signature present",[ic]:"Attempt to load a program that does not exist",[zc]:"Execution of the program referenced by account at index $accountIndex is temporarily restricted.",[Pc]:"ResanitizationNeeded",[gc]:"Transaction failed to sanitize accounts offsets correctly",[fc]:"Transaction did not pass signature verification",[hc]:"Transaction locked too many accounts",[Bc]:"Sum of account balances before and after transaction do not match",[nc]:"The transaction failed with the error `$errorName`",[Oc]:"Transaction version is unsupported",[Tc]:"Transaction would exceed account data limit within the block",[wc]:"Transaction would exceed total account data limit",[Ic]:"Transaction would exceed max account limit within the block",[mc]:"Transaction would exceed max Block Cost Limit",[yc]:"Transaction would exceed max Vote Cost Limit",[Ft]:"Attempted to sign a transaction with an address that is not a signer for it",[Hs]:"Transaction is missing an address at index: $index.",[Vt]:"Transaction has no expected signers therefore it cannot be encoded",[vr]:"Transaction compute unit limit must be an integer in the range [0, $maxComputeUnitLimit]. `$computeUnitLimit` given",[hr]:"Transaction size $transactionSize exceeds limit of $transactionSizeLimit bytes",[Ut]:"Transaction does not have a blockhash lifetime",[Pt]:"Transaction is not a durable nonce transaction",[Or]:"Contents of these address lookup tables unknown: $lookupTableAddresses",[Nr]:"Lookup of address at index $highestRequestedIndex failed for lookup table `$lookupTableAddress`. Highest known index is $highestKnownIndex. The lookup table may have been extended since its contents were retrieved",[Tr]:"No fee payer set in CompiledTransaction",[Ir]:"Could not find program address at index $index",[Xs]:"Failed to estimate the compute unit consumption for this transaction message. This is likely because simulating the transaction failed. Inspect the `cause` property of this error to learn more",[qs]:"Failed to estimate the loaded accounts data size for this transaction message. The RPC did not return a `loadedAccountsDataSize` value from simulation. This value is required for version 1 transactions",[Zs]:"Transaction failed when it was simulated in order to estimate the compute unit consumption. The compute unit estimate provided is for a transaction that failed when simulated and may not be representative of the compute units this transaction would consume if successful. Inspect the `cause` property of this error to learn more",[Js]:"Transaction failed when it was simulated in order to estimate its resource limits. The resource limit estimates provided are for a transaction that failed when simulated and may not be representative of the resources this transaction would consume if successful. Inspect the `cause` property of this error to learn more",[Ks]:"Transaction is missing a fee payer.",[kt]:"Could not determine this transaction's signature. Make sure that the transaction has been signed by its fee payer.",[js]:"Transaction first instruction is not advance nonce account instruction.",[Ys]:"Transaction with no instructions cannot be durable nonce transaction.",[Ke]:"This transaction includes an address (`$programAddress`) which is both invoked and set as the fee payer. Program addresses may not pay fees",[fe]:"This transaction includes an address (`$programAddress`) which is both invoked and marked writable. Program addresses may not be writable",[Ye]:"The transaction message expected the transaction to have $numRequiredSignatures signatures, got $signaturesLength.",[Bt]:"Transaction is missing signatures for addresses: $addresses.",[zt]:"Transaction version must be in the range [0, 127]. `$actualVersion` given",[ae]:"This version of Kit does not support decoding transactions with version $unsupportedVersion. The current max supported version is 1.",[pr]:"The transaction has a durable nonce lifetime (with nonce `$nonce`), but the nonce account address is in a lookup table. The lifetime constraint cannot be constructed without fetching the lookup tables for the transaction.",[Yt]:"Invalid transaction config mask: $mask. Bits 0 and 1 must match (both set or both unset)",[Gt]:"Transaction message bytes are malformed: $messageBytes",[Wt]:"Transaction message bytes are empty, so the transaction cannot be encoded",[$t]:"Transaction bytes are empty, so no transaction can be decoded",[Ht]:"Transaction version 0 must be encoded with signatures first. This transaction was encoded with first byte $firstByte, which is expected to be a signature count for v0 transactions.",[Kt]:"The provided transaction bytes expect that there should be $numExpectedSignatures signatures, but the bytes are not long enough to contain a transaction message with this many signatures. The provided bytes are $transactionBytesLength bytes long.",[yr]:"Transaction heap size must be an integer multiple of $multipleOf bytes in the range [$minHeapSize, $maxHeapSize]. `$heapSize` given",[Cr]:"The transaction has a durable nonce lifetime, but the nonce account index is invalid. Expected a nonce account index less than $numberOfStaticAccounts, got $nonceAccountIndex.",[Dr]:"The transaction config value for $configName has the incorrect kind. Expected $expectedKind, got $actualKind.",[Lr]:"The transaction does not have the same number of instruction headers and instruction payloads. Got $numInstructionHeaders instruction headers, and $numInstructionPayloads instruction payloads.",[De]:"Transaction has $actualCount unique signer addresses but the maximum allowed is $maxAllowed",[Le]:"Transaction has $actualCount unique account addresses but the maximum allowed is $maxAllowed",[ve]:"Transaction has $actualCount instructions but the maximum allowed is $maxAllowed",[ye]:"The instruction at index $instructionIndex has $actualCount account references but the maximum allowed is $maxAllowed",[Qs]:"Could not find an account address at index $index while decompiling an instruction",[ec]:"`getTransaction` responses fetched with `encoding: 'jsonParsed'` cannot be decoded. Re-fetch the transaction with `encoding: 'base64'`, `'base58'`, or `'json'`",[tc]:"Could not recognize the shape of this `getTransaction` response. Expected a response fetched with `encoding: 'base64'`, `'base58'`, or `'json'`",[Lu]:"`$hookName` requires the following capabilities to be installed on the client: [$capabilities]. $providerHint",[Du]:"`$hookName` was called outside of a `ClientProvider`. Mount a `<ClientProvider client={client}>` in the ancestor tree.",[vu]:"The subscription closed in an error state but did not report an error.",[Tu]:"Cannot $operation: no wallet connected",[hu]:"No signing wallet connected (status: $status)",[pu]:"Connected wallet does not support signing",[Cu]:'Account $address is not available in wallet "$walletName"'};function Bu(e,t={}){{let n=`Solana error #${e}; Decode this error by running \`npx @solana/errors decode -- ${e}`;return Object.keys(t).length&&(n+=` '${zu(t)}'`),`${n}\``}}function be(e,t){return e instanceof Error&&e.name==="SolanaError"?t!==void 0?e.context.__code===t:!0:!1}var d=class extends Error{cause=this.cause;context;constructor(...[e,t]){let n,r;t&&Object.entries(Object.getOwnPropertyDescriptors(t)).forEach(([a,i])=>{a==="cause"?r={cause:i.value}:(n===void 0&&(n={__code:e}),Object.defineProperty(n,a,i))});let o=Bu(e,n);super(o,r),this.context=Object.freeze(n===void 0?{__code:e}:n),this.name="SolanaError"}};function ku(e,t){if(e.length>=t)return e;let n=new Uint8Array(t).fill(0);return n.set(e),n}var Fu=(e,t)=>ku(e.length<=t?e:e.slice(0,t),t);function Re(e,t,n){let r=(n===0||n<=-e.byteLength)&&e.length===t.length?e:e.slice(n,n+t.length);return je(r,t)}function je(e,t){return e.length===t.length&&e.every((n,r)=>n===t[r])}function ne(e,t){return"fixedSize"in t?t.fixedSize:t.getSizeFromValue(e)}function I(e){return Object.freeze({...e,encode:t=>{let n=new Uint8Array(ne(t,e));return e.write(t,n,0),n}})}function S(e){return Object.freeze({...e,decode:(t,n=0)=>e.read(t,n)[0]})}function N(e){return"fixedSize"in e&&typeof e.fixedSize=="number"}function Xe(e){if(!N(e))throw new d(Zt)}function Vu(e){return!N(e)}function q(e,t){if(N(e)!==N(t))throw new d(qt);if(N(e)&&N(t)&&e.fixedSize!==t.fixedSize)throw new d(Jt,{decoderFixedSize:t.fixedSize,encoderFixedSize:e.fixedSize});if(!N(e)&&!N(t)&&e.maxSize!==t.maxSize)throw new d(Qt,{decoderMaxSize:t.maxSize,encoderMaxSize:e.maxSize});return{...t,...e,decode:t.decode,encode:e.encode,read:t.read,write:e.write}}function Kr(e,t,n=0){if(t.length-n<=0)throw new d(jt,{codecDescription:e})}function Me(e,t,n,r=0){let o=n.length-r;if(o<t)throw new d(Xt,{bytesLength:o,codecDescription:e,expected:t})}function Hr(e,t,n){if(t<0||t>n)throw new d(on,{bytesLength:n,codecDescription:e,offset:t})}function Ze(e,t){let n=((i,s,c)=>{let u=e.encode(i);return c=t.write(u.length,s,c),s.set(u,c),c+u.length});if(N(t)&&N(e))return I({...e,fixedSize:t.fixedSize+e.fixedSize,write:n});let r=N(t)?t.fixedSize:t.maxSize??null,o=N(e)?e.fixedSize:e.maxSize??null,a=r!==null&&o!==null?r+o:null;return I({...e,...a!==null?{maxSize:a}:{},getSizeFromValue:i=>{let s=ne(i,e);return ne(s,t)+s},write:n})}function qe(e,t){let n=((i,s)=>{let[c,u]=t.read(i,s),_=Number(c);return s=u,(s>0||i.length>_)&&(i=i.slice(s,s+_)),Me("addDecoderSizePrefix",_,i),[e.decode(i),s+_]});if(N(t)&&N(e))return S({...e,fixedSize:t.fixedSize+e.fixedSize,read:n});let r=N(t)?t.fixedSize:t.maxSize??null,o=N(e)?e.fixedSize:e.maxSize??null,a=r!==null&&o!==null?r+o:null;return S({...e,...a!==null?{maxSize:a}:{},read:n})}function ge(e,t,n){let r=e.byteOffset+(t??0),o=n??e.byteLength,a;return typeof SharedArrayBuffer>"u"?a=e.buffer:e.buffer instanceof SharedArrayBuffer?(a=new ArrayBuffer(e.length),new Uint8Array(a).set(new Uint8Array(e)),r=t??0):a=e.buffer,(r===0||r===-a.byteLength)&&o===a.byteLength?a:a.slice(r,r+o)}function J(e,t){return I({fixedSize:t,write:(n,r,o)=>{let a=e.encode(n),i=a.length>t?a.slice(0,t):a;return r.set(i,o),o+t}})}function H(e,t){return S({fixedSize:t,read:(n,r)=>{Me("fixCodecSize",t,n,r),(r>0||n.length>t)&&(n=n.slice(r,r+t)),N(e)&&(n=Fu(n,e.fixedSize));let[o]=e.read(n,0);return[o,r+t]}})}function Gu(e,t){return S({...e,read:(n,r)=>{let o=u=>Wu(u,n.length),a=t.preOffset?t.preOffset({bytes:n,preOffset:r,wrapBytes:o}):r;Hr("offsetDecoder",a,n.length);let[i,s]=e.read(n,a),c=t.postOffset?t.postOffset({bytes:n,newPreOffset:a,postOffset:s,preOffset:r,wrapBytes:o}):s;return Hr("offsetDecoder",c,n.length),[i,c]}})}function Wu(e,t){return t===0?0:(e%t+t)%t}function $u(e,t){if(N(e)){let n=t(e.fixedSize);if(n<0)throw new d(rn,{bytesLength:n,codecDescription:"resizeDecoder"});return S({...e,fixedSize:n})}return e}function Yr(e,t){return Gu($u(e,n=>n+t),{postOffset:({postOffset:n})=>n+t})}function m(e,t){return I({...Vu(e)?{...e,getSizeFromValue:n=>e.getSizeFromValue(t(n))}:e,write:(n,r,o)=>e.write(t(n),r,o)})}function w(e,t){return S({...e,read:(n,r)=>{let[o,a]=e.read(n,r);return[t(o,n,r),a]}})}function Hu(e,t,n=t){if(!t.match(new RegExp(`^[${e}]*$`)))throw new d(we,{alphabet:e,base:e.length,value:n})}var Ku=e=>I({getSizeFromValue:t=>{let[n,r]=jr(t,e[0]);if(!r)return t.length;let o=Xr(r,e);return n.length+Math.ceil(o.toString(16).length/2)},write(t,n,r){if(Hu(e,t),t==="")return r;let[o,a]=jr(t,e[0]);if(!a)return n.set(new Uint8Array(o.length).fill(0),r),r+o.length;let i=Xr(a,e),s=[];for(;i>0n;)s.unshift(Number(i%256n)),i/=256n;let c=[...Array(o.length).fill(0),...s];return n.set(c,r),r+c.length}}),Yu=e=>S({read(t,n){let r=n===0||n<=-t.byteLength?t:t.slice(n);if(r.length===0)return["",t.length];let o=r.findIndex(c=>c!==0);o=o===-1?r.length:o;let a=e[0].repeat(o);if(o===r.length)return[a,t.length];let i=r.slice(o).reduce((c,u)=>c*256n+BigInt(u),0n),s=ju(i,e);return[a+s,t.length]}});function jr(e,t){let[n,r]=e.split(new RegExp(`((?!${t}).*)`));return[n,r]}function Xr(e,t){let n=BigInt(t.length),r=0n;for(let o of e)r*=n,r+=BigInt(t.indexOf(o));return r}function ju(e,t){let n=BigInt(t.length),r=[];for(;e>0n;)r.unshift(t[Number(e%n)]),e/=n;return r.join("")}var Zr="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",xe=()=>Ku(Zr),Je=()=>Yu(Zr);var NA=globalThis.TextDecoder,IA=globalThis.TextEncoder;function qr(){if(typeof globalThis.crypto>"u"||typeof globalThis.crypto.getRandomValues!="function")throw new d(wt)}function Ue(){if(!globalThis.isSecureContext)throw new d(ht)}var _e;async function Xu(e){return _e===void 0&&(_e=new Promise(t=>{e.generateKey("Ed25519",!1,["sign","verify"]).then(()=>{t(_e=!0)}).catch(()=>{t(_e=!1)})})),typeof _e=="boolean"?_e:await _e}function Jr(){if(Ue(),typeof globalThis.crypto>"u"||typeof globalThis.crypto.subtle?.digest!="function")throw new d(pt)}async function Qr(){if(Ue(),typeof globalThis.crypto>"u"||typeof globalThis.crypto.subtle?.generateKey!="function")throw new d(Lt);if(!await Xu(globalThis.crypto.subtle))throw new d(Ct)}function gn(){if(Ue(),typeof globalThis.crypto>"u"||typeof globalThis.crypto.subtle?.exportKey!="function")throw new d(Dt)}function eo(){if(Ue(),typeof globalThis.crypto>"u"||typeof globalThis.crypto.subtle?.sign!="function")throw new d(vt)}function to(){if(Ue(),typeof globalThis.crypto>"u"||typeof globalThis.crypto.subtle?.verify!="function")throw new d(yt)}var En,Sn;function mn(){return En||(En=xe()),En}function Zu(){return Sn||(Sn=Je()),Sn}function Qe(e){if(e.length<32||e.length>44)return!1;let t=mn();try{return t.encode(e).byteLength===32}catch{return!1}}function et(e){if(e.length<32||e.length>44)throw new d(Ce,{actualLength:e.length});let r=mn().encode(e).byteLength;if(r!==32)throw new d(pe,{actualLength:r})}function O(e){return et(e),e}function z(){return m(J(mn(),32),e=>O(e))}function T(){return H(Zu(),32)}function qu(){return q(z(),T())}function Pe(){return new Intl.Collator("en",{caseFirst:"lower",ignorePunctuation:!1,localeMatcher:"best fit",numeric:!1,sensitivity:"variant",usage:"sort"}).compare}var Ju=37095705934669439343138083508754565189542113879843219016388785533085940283555n,P=57896044618658097711785492504343953926634992332820282019728792003956564819949n,no=19681161376707505956807079304988542015446066515923890162744021073123829784752n;function V(e){let t=e%P;return t>=0n?t:P+t}function Q(e,t){let n=e;for(;t-- >0n;)n*=n,n%=P;return n}function Qu(e){let n=e*e%P*e%P,r=Q(n,2n)*n%P,o=Q(r,1n)*e%P,a=Q(o,5n)*o%P,i=Q(a,10n)*a%P,s=Q(i,20n)*i%P,c=Q(s,40n)*s%P,u=Q(c,80n)*c%P,_=Q(u,80n)*c%P,A=Q(_,10n)*a%P;return Q(A,2n)*e%P}function ed(e,t){let n=V(t*t*t),r=V(n*n*t),o=Qu(e*r),a=V(e*n*o),i=V(t*a*a),s=a,c=V(a*no),u=i===e,_=i===V(-e),A=i===V(-e*no);return u&&(a=s),(_||A)&&(a=c),(V(a)&1n)===1n&&(a=V(-a)),!u&&!_?null:a}function td(e,t){let n=V(e*e),r=V(n-1n),o=V(Ju*n+1n),a=ed(r,o);if(a===null)return!1;let i=(t&128)!==0;return!(a===0n&&i)}function nd(e){let t=e.toString(16);return t.length===1?`0${t}`:t}function rd(e){let n=`0x${e.reduce((r,o,a)=>`${nd(a===31?o&-129:o)}${r}`,"")}`;return BigInt(n)}function od(e){if(e.byteLength!==32)return!1;let t=rd(e);return td(t,e[31])}var ro=32,oo=16,ad=[80,114,111,103,114,97,109,68,101,114,105,118,101,100,65,100,100,114,101,115,115];async function id({programAddress:e,seeds:t}){if(Jr(),t.length>oo)throw new d(Nt,{actual:t.length,maxSeeds:oo});let n,r=t.reduce((c,u,_)=>{let A=typeof u=="string"?(n||=new TextEncoder).encode(u):u;if(A.byteLength>ro)throw new d(It,{actual:A.byteLength,index:_,maxSeedLength:ro});return c.push(...A),c},[]),o=qu(),a=o.encode(e),i=await crypto.subtle.digest("SHA-256",new Uint8Array([...r,...a,...ad])),s=new Uint8Array(i);if(od(s))throw new d(He);return o.decode(s)}async function ao({programAddress:e,seeds:t}){let n=255;for(;n>0;)try{return[await id({programAddress:e,seeds:[...t,new Uint8Array([n])]}),n]}catch(r){if(be(r,He))n--;else throw r}throw new d(Tt)}async function tt(e){if(gn(),e.type!=="public"||e.algorithm.name!=="Ed25519")throw new d(Ot);let t=await crypto.subtle.exportKey("raw",e);return T().decode(new Uint8Array(t))}function io(e,t,n,r){if(r<t||r>n)throw new d(nn,{codecDescription:e,max:n,min:t,value:r})}function so(e){return e?.endian!==1}function nt(e){return I({fixedSize:e.size,write(t,n,r){e.range&&io(e.name,e.range[0],e.range[1],t);let o=new ArrayBuffer(e.size);return e.set(new DataView(o),t,so(e.config)),n.set(new Uint8Array(o),r),r+e.size}})}function rt(e){return S({fixedSize:e.size,read(t,n=0){Kr(e.name,t,n),Me(e.name,e.size,t,n);let r=new DataView(ge(t,n,e.size));return[e.get(r,so(e.config)),n+e.size]}})}var K=()=>I({getSizeFromValue:e=>e<=127?1:e<=16383?2:3,maxSize:3,write:(e,t,n)=>{io("shortU16",0,65535,e);let r=[0];for(let o=0;;o+=1){let a=Number(e)>>o*7;if(a===0)break;let i=127&a;r[o]=i,o>0&&(r[o-1]|=128)}return t.set(r,n),n+r.length}}),G=()=>S({maxSize:3,read:(e,t)=>{let n=0,r=0;for(;++r;){let o=r-1,a=e[t+o],i=127&a;if(n|=i<<o*7,(a&128)===0)break}return[n,t+r]}});var co=(e={})=>nt({config:e,name:"u16",range:[0,+"0xffff"],set:(t,n,r)=>t.setUint16(0,Number(n),r),size:2}),uo=(e={})=>rt({config:e,get:(t,n)=>t.getUint16(0,n),name:"u16",size:2});var ie=(e={})=>nt({config:e,name:"u32",range:[0,+"0xffffffff"],set:(t,n,r)=>t.setUint32(0,Number(n),r),size:4}),F=(e={})=>rt({config:e,get:(t,n)=>t.getUint32(0,n),name:"u32",size:4});var Ee=(e={})=>nt({config:e,name:"u64",range:[0n,BigInt("0xffffffffffffffff")],set:(t,n,r)=>t.setBigUint64(0,BigInt(n),r),size:8}),ee=(e={})=>rt({config:e,get:(t,n)=>t.getBigUint64(0,n),name:"u64",size:8});var D=()=>nt({name:"u8",range:[0,+"0xff"],set:(e,t)=>e.setUint8(0,Number(t)),size:1}),p=()=>rt({get:e=>e.getUint8(0),name:"u8",size:1});function _o(e,t,n){if(t!==n)throw new d(en,{actual:n,codecDescription:e,expected:t})}function sd(e){return e.reduce((t,n)=>t===null||n===null?null:Math.max(t,n),0)}function se(e){return e.reduce((t,n)=>t===null||n===null?null:t+n,0)}function Se(e){return N(e)?e.fixedSize:null}function Ae(e){return N(e)?e.fixedSize:e.maxSize??null}function b(e,t={}){let n=t.size??ie(),r=at(n,Se(e)),o=at(n,Ae(e))??void 0;return I({...r!==null?{fixedSize:r}:{getSizeFromValue:a=>(typeof n=="object"?ne(a.length,n):0)+[...a].reduce((s,c)=>s+ne(c,e),0),maxSize:o},write:(a,i,s)=>(typeof n=="number"&&_o(t.description??"array",n,a.length),typeof n=="object"&&(s=n.write(a.length,i,s)),a.forEach(c=>{s=e.write(c,i,s)}),s)})}function M(e,t={}){let n=t.size??F(),r=Se(e),o=at(n,r),a=at(n,Ae(e))??void 0;return S({...o!==null?{fixedSize:o}:{maxSize:a},read:(i,s)=>{let c=[];if(typeof n=="object"&&!t.requireSizePrefix&&s>=i.length)return[c,s];if(n==="remainder"){for(;s<i.length;){let[A,E]=e.read(i,s);s=E,c.push(A)}return[c,s]}let[u,_]=typeof n=="number"?[n,s]:n.read(i,s);s=_;for(let A=0;A<u;A+=1){let[E,f]=e.read(i,s);s=f,c.push(E)}return[c,s]}})}function at(e,t){return typeof e!="number"?null:e===0?0:t===null?null:t*e}function In(e={}){return m(e.size??D(),t=>t?1:0)}function it(e={}){return w(e.size??p(),t=>Number(t)===1)}function re(){return I({getSizeFromValue:e=>e.length,write:(e,t,n)=>(t.set(e,n),n+e.length)})}function ce(){return S({read:(e,t)=>{let n=e.slice(t);return[n,t+n.length]}})}var cd=()=>S({read(e,t){return[e.slice(t).reduce((r,o)=>r+o.toString(16).padStart(2,"0"),""),e.length]}});function Ao(e){return I({fixedSize:e.length,write:(t,n,r)=>(n.set(e,r),r+e.length)})}function lo(e){return S({fixedSize:e.length,read:(t,n)=>{let r=cd();if(!Re(t,e,n))throw new d(sn,{constant:e,data:t,hexConstant:r.decode(e),hexData:r.decode(t),offset:n});return[void 0,n+e.length]}})}function On(e,t){let n=se(e.map(Se)),r=se(e.map(Ae))??void 0;return I({...n===null?{getSizeFromValue:o=>e.map((a,i)=>ne(o[i],a)).reduce((a,i)=>a+i,0),maxSize:r}:{fixedSize:n},write:(o,a,i)=>(_o(t?.description??"tuple",e.length,o.length),e.forEach((s,c)=>{i=s.write(o[c],a,i)}),i)})}function le(e){let t=se(e.map(Se)),n=se(e.map(Ae))??void 0;return S({...t===null?{maxSize:n}:{fixedSize:t},read:(r,o)=>{let a=[];return e.forEach(i=>{let[s,c]=i.read(r,o);a.push(s),o=c}),[a,o]}})}function st(e,t){let n=fo(e),r=(a,i,s)=>{let c=t(a);return Nn(e,c),e[c].write(a,i,s)};if(n!==null)return I({fixedSize:n,write:r});let o=Ro(e);return I({...o!==null?{maxSize:o}:{},getSizeFromValue:a=>{let i=t(a);return Nn(e,i),ne(a,e[i])},write:r})}function ct(e,t){let n=fo(e),r=(a,i)=>{let s=t(a,i);return Nn(e,s),e[s].read(a,i)};if(n!==null)return S({fixedSize:n,read:r});let o=Ro(e);return S({...o!==null?{maxSize:o}:{},read:r})}function Nn(e,t){if(typeof e[t]>"u")throw new d(an,{maxRange:e.length-1,minRange:0,variant:t})}function fo(e){if(e.length===0)return 0;if(!N(e[0]))return null;let t=e[0].fixedSize;return e.every(r=>N(r)&&r.fixedSize===t)?t:null}function Ro(e){return sd(e.map(t=>Ae(t)))}function ud(e){let t=[...new Set(Object.values(e).filter(i=>typeof i=="number"))].sort(),n=Object.fromEntries(Object.entries(e).slice(t.length)),r=Object.keys(n),o=Object.values(n),a=[...new Set([...r,...o.filter(i=>typeof i=="string")])];return{enumKeys:r,enumRecord:n,enumValues:o,numericalValues:t,stringValues:a}}function dd({discriminator:e,enumKeys:t,enumValues:n,useValuesAsDiscriminators:r}){return r?_d(n,o=>o===e):e>=0&&e<t.length?e:-1}function _d(e,t){let n=e.length;for(;n--;)if(t(e[n],n,e))return n;return-1}function Ad(e){if(e.length===0)return"";let t=[e[0],e[0]],n=[];for(let r=1;r<e.length;r++){let o=e[r];t[1]+1===o?t[1]=o:(n.push(t[0]===t[1]?`${t[0]}`:`${t[0]}-${t[1]}`),t=[o,o])}return n.push(t[0]===t[1]?`${t[0]}`:`${t[0]}-${t[1]}`),n.join(", ")}function Tn(e,t={}){let n=t.size??p(),r=t.useValuesAsDiscriminators??!1,{enumKeys:o,enumValues:a,numericalValues:i}=ud(e);if(r&&a.some(s=>typeof s=="string"))throw new d(cn,{stringValues:a.filter(s=>typeof s=="string")});return w(n,s=>{let c=Number(s),u=dd({discriminator:c,enumKeys:o,enumValues:a,useValuesAsDiscriminators:r});if(u<0){let _=r?i:[...Array(o.length).keys()];throw new d(tn,{discriminator:c,formattedValidDiscriminators:Ad(_),validDiscriminators:_})}return a[u]})}function ot(){return I({fixedSize:0,write:(e,t,n)=>n})}function me(){return S({fixedSize:0,read:(e,t)=>[void 0,t]})}function go(e,t={}){let n=t.prefix===null?m(ot(),o=>{}):In({size:t.prefix??D()}),r=t.noneValue==="zeroes"?(Xe(e),J(ot(),e.fixedSize)):t.noneValue?Ao(t.noneValue):ot();return st([m(On([n,r]),o=>[!1,void 0]),m(On([n,e]),o=>[!0,o])],o=>+(o!==null))}function hn(e){return st(e.map(([,t])=>t),t=>{let n=e.findIndex(([r])=>r(t));if(n===-1)throw new d(un);return n})}function Eo(e){return ct(e.map(([,t])=>t),t=>{let n=e.findIndex(([r])=>r(t));if(n===-1)throw new d(dn,{bytes:t});return n})}function So(e,t,n){return st([t,n],r=>e(r)?0:1)}function mo(e,t,n){return ct([t,n],r=>e(r)?0:1)}function L(e){let t=e.map(([,o])=>o),n=se(t.map(Se)),r=se(t.map(Ae))??void 0;return I({...n===null?{getSizeFromValue:o=>e.map(([a,i])=>ne(o[a],i)).reduce((a,i)=>a+i,0),maxSize:r}:{fixedSize:n},write:(o,a,i)=>(e.forEach(([s,c])=>{i=c.write(o[s],a,i)}),i)})}function x(e){let t=e.map(([,o])=>o),n=se(t.map(Se)),r=se(t.map(Ae))??void 0;return S({...n===null?{maxSize:r}:{fixedSize:n},read:(o,a)=>{let i={};return e.forEach(([s,c])=>{let[u,_]=c.read(o,a);a=_,i[s]=u}),[i,a]}})}var ld=e=>({__option:"Some",value:e}),Oo=()=>({__option:"None"});function Oe(e,t={}){let n=t.prefix===null?w(me(),()=>!1):it({size:t.prefix??p()}),r=t.noneValue==="zeroes"?(Xe(e),H(me(),e.fixedSize)):t.noneValue?lo(t.noneValue):me();return ct([w(le([n,r]),()=>Oo()),w(le([n,e]),([,o])=>ld(o))],(o,a)=>{if(t.prefix===null&&!t.noneValue)return+(a<o.length);if(t.prefix===null&&t.noneValue!=null){let i=t.noneValue==="zeroes"?new Uint8Array(r.fixedSize).fill(0):t.noneValue;return Re(o,i,a)?0:1}return Number(n.read(o,a)[0])})}function ut(e,...t){return t.reduce((n,r)=>r(n),e)}var B=(e=>(e[e.WRITABLE_SIGNER=3]="WRITABLE_SIGNER",e[e.READONLY_SIGNER=2]="READONLY_SIGNER",e[e.WRITABLE=1]="WRITABLE",e[e.READONLY=0]="READONLY",e))(B||{}),fd=2,Rd=1;function W(e){return e>=2}function te(e){return(e&Rd)!==0}function dt(e,t){return e|t}function No(e){return e|fd}function Io(e){return Qe(e)}function gd(e){try{et(e)}catch(t){throw be(t,Ce)?new d(St,t.context):be(t,pe)?new d(mt,t.context):t}}function pn(e){return gd(e),e}function Do(e){return"lifetimeConstraint"in e&&typeof e.lifetimeConstraint.blockhash=="string"&&typeof e.lifetimeConstraint.lastValidBlockHeight=="bigint"&&Io(e.lifetimeConstraint.blockhash)}function Pn(e,t){return"lifetimeConstraint"in t&&t.lifetimeConstraint&&"blockhash"in t.lifetimeConstraint&&t.lifetimeConstraint.blockhash===e.blockhash&&t.lifetimeConstraint.lastValidBlockHeight===e.lastValidBlockHeight?t:Object.freeze({...t,lifetimeConstraint:Object.freeze(e)})}var zn=1,Cn;function Dn(){return Cn||(Cn=D()),Cn}var Ln;function vn(){return Ln||(Ln=p()),Ln}function Bn(){return L([["numSignerAccounts",Dn()],["numReadonlySignerAccounts",Dn()],["numReadonlyNonSignerAccounts",Dn()]])}function kn(){return x([["numSignerAccounts",vn()],["numReadonlySignerAccounts",vn()],["numReadonlyNonSignerAccounts",vn()]])}var yn;function Lo(){return yn||(yn=m(L([["programAddressIndex",D()],["accountIndices",b(D(),{size:K()})],["data",Ze(re(),K())]]),e=>e.accountIndices!==void 0&&e.data!==void 0?e:{...e,accountIndices:e.accountIndices??[],data:e.data??new Uint8Array(0)})),yn}var wn;function vo(){return wn||(wn=w(x([["programAddressIndex",p()],["accountIndices",M(p(),{size:G()})],["data",qe(ce(),G())]]),e=>{if(e.accountIndices.length&&e.data.byteLength)return e;let{accountIndices:t,data:n,...r}=e;return{...r,...t.length?{accountIndices:t}:null,...n.byteLength?{data:n}:null}})),wn}function Ed(e,t,n=t){if(!t.match(new RegExp(`^[${e}]*$`)))throw new d(we,{alphabet:e,base:e.length,value:n})}var Sd=e=>I({getSizeFromValue:t=>{let[n,r]=To(t,e[0]);if(!r)return t.length;let o=ho(r,e);return n.length+Math.ceil(o.toString(16).length/2)},write(t,n,r){if(Ed(e,t),t==="")return r;let[o,a]=To(t,e[0]);if(!a)return n.set(new Uint8Array(o.length).fill(0),r),r+o.length;let i=ho(a,e),s=[];for(;i>0n;)s.unshift(Number(i%256n)),i/=256n;let c=[...Array(o.length).fill(0),...s];return n.set(c,r),r+c.length}}),md=e=>S({read(t,n){let r=n===0||n<=-t.byteLength?t:t.slice(n);if(r.length===0)return["",t.length];let o=r.findIndex(c=>c!==0);o=o===-1?r.length:o;let a=e[0].repeat(o);if(o===r.length)return[a,t.length];let i=r.slice(o).reduce((c,u)=>c*256n+BigInt(u),0n),s=Od(i,e);return[a+s,t.length]}});function To(e,t){let[n,r]=e.split(new RegExp(`((?!${t}).*)`));return[n,r]}function ho(e,t){let n=BigInt(t.length),r=0n;for(let o of e)r*=n,r+=BigInt(t.indexOf(o));return r}function Od(e,t){let n=BigInt(t.length),r=[];for(;e>0n;)r.unshift(t[Number(e%n)]),e/=n;return r.join("")}var yo="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",Nd=()=>Sd(yo),Id=()=>md(yo);function Fn(){return m(go(J(Nd(),32),{noneValue:"zeroes",prefix:null}),e=>e??null)}function Vn(){return H(Id(),32)}function Td(){return m(L([["header",Bn()],["staticAccounts",b(z(),{size:K()})],["lifetimeToken",Fn()],["instructions",b(Lo(),{size:K()})]]),e=>({...e,lifetimeToken:"lifetimeToken"in e?e.lifetimeToken:void 0}))}function hd(){return w(x([["header",kn()],["staticAccounts",M(T(),{size:G()})],["lifetimeToken",Vn()],["instructions",M(vo(),{size:G()})]]),e=>({...e,version:"legacy"}))}var xn=128;function wo(){return I({getSizeFromValue:e=>e==="legacy"?0:1,maxSize:1,write:(e,t,n)=>{if(e==="legacy")return n;if(e<0||e>127)throw new d(zt,{actualVersion:e});if(e>zn)throw new d(ae,{unsupportedVersion:e});return t.set([e|xn],n),n+1}})}function Ne(){return S({maxSize:1,read:(e,t)=>{let n=e[t];if((n&xn)===0)return["legacy",t];{let r=n^xn;if(r>zn)throw new d(ae,{unsupportedVersion:r});return[r,t+1]}}})}var bn;function pd(){if(!bn){let e=b(D(),{size:K()});bn=L([["lookupTableAddress",z()],["writableIndexes",e],["readonlyIndexes",e]])}return bn}var Mn;function Cd(){if(!Mn){let e=M(p(),{size:G()});Mn=x([["lookupTableAddress",T()],["writableIndexes",e],["readonlyIndexes",e]])}return Mn}function Dd(){return m(L([["version",wo()],["header",Bn()],["staticAccounts",b(z(),{size:K()})],["lifetimeToken",Fn()],["instructions",b(Lo(),{size:K()})],["addressTableLookups",b(pd(),{size:K()})]]),e=>({...e,addressTableLookups:e.addressTableLookups??[],lifetimeToken:"lifetimeToken"in e?e.lifetimeToken:void 0}))}function Ld(){return w(x([["version",Ne()],["header",kn()],["staticAccounts",M(T(),{size:G()})],["lifetimeToken",Vn()],["instructions",M(vo(),{size:G()})],["addressTableLookups",M(Cd(),{size:G()})]]),({addressTableLookups:e,...t})=>e?.length?{...t,addressTableLookups:e,version:0}:{...t,version:0})}var el=32*1024,tl=256*1024;var Un=3,bo=4,Mo=8,xo=16;function vd(e){let t=e&Un;if(t===1||t===2)throw new d(Yt,{mask:e});return t===Un}function yd(e){return(e&bo)!==0}function wd(e){return(e&Mo)!==0}function bd(e){return(e&xo)!==0}function Md(){return hn([[e=>e.kind==="u32",m(L([["value",ie()]]),e=>e)],[e=>e.kind==="u64",m(L([["value",Ee()]]),e=>e)]])}function xd(){return b(Md(),{size:"remainder"})}function Ud(e){let t=vd(e),n=yd(e),r=wd(e),o=bd(e),a=w(F(),c=>({kind:"u32",value:c})),i=w(ee(),c=>({kind:"u64",value:c})),s=me();return w(le([t?i:s,n?a:s,r?a:s,o?a:s]),c=>c.filter(Boolean))}function Pd(){return L([["programAccountIndex",D()],["numInstructionAccounts",D()],["numInstructionDataBytes",co()]])}function zd(){return x([["programAccountIndex",p()],["numInstructionAccounts",p()],["numInstructionDataBytes",uo()]])}function Bd(){return L([["instructionAccountIndices",b(D(),{size:"remainder"})],["instructionData",re()]])}function kd(e){return x([["instructionAccountIndices",M(p(),{size:e.numInstructionAccounts})],["instructionData",H(ce(),e.numInstructionDataBytes)]])}function Fd(){return m(L([["version",wo()],["header",Bn()],["configMask",ie()],["lifetimeToken",Fn()],["numInstructions",D()],["numStaticAccounts",D()],["staticAccounts",b(z(),{size:"remainder"})],["configValues",xd()],["instructionHeaders",b(Pd(),{size:"remainder"})],["instructionPayloads",b(Bd(),{size:"remainder"})]]),e=>({...e,lifetimeToken:"lifetimeToken"in e?e.lifetimeToken:void 0}))}function Vd(){return S({read(e,t){let[{header:n,configMask:r,lifetimeToken:o,numInstructions:a,numStaticAccounts:i},s]=x([["version",Ne()],["header",kn()],["configMask",F()],["lifetimeToken",Vn()],["numInstructions",p()],["numStaticAccounts",p()]]).read(e,t),c=s,[u,_]=M(T(),{size:i}).read(e,c);c=_;let[A,E]=Ud(r).read(e,c);c=E;let[f,h]=M(zd(),{size:a}).read(e,c);c=h;let R=[];for(let g of f){let[Z,v]=kd(g).read(e,c);R.push(Z),c=v}return[{configMask:r,configValues:A,header:n,instructionHeaders:f,instructionPayloads:R,lifetimeToken:o,numInstructions:a,numStaticAccounts:i,staticAccounts:u,version:1},c]}})}function Uo(){return m(hn([[e=>e.version==="legacy",Td()],[e=>e.version===0,Dd()],[e=>e.version===1,Fd()]]),e=>{if(e.version!=="legacy"&&e.version>zn)throw new d(ae,{unsupportedVersion:e.version});return e})}function ze(){return S({read(e,t){let[n]=Ne().read(e,t);return Eo([[()=>n==="legacy",hd()],[()=>n===0,Ld()],[()=>n===1,Vd()]]).read(e,t)}})}function po(e,t,n){e[t]=n(e[t]??{role:B.READONLY})}var k=Symbol("AddressMapTypeProperty");function Po(e,t){let n={[e]:{[k]:0,role:B.WRITABLE_SIGNER}},r=new Set;for(let o of t)if(po(n,o.programAddress,a=>{if(r.add(o.programAddress),k in a){if(te(a.role))throw a[k]===0?new d(Ke,{programAddress:o.programAddress}):new d(fe,{programAddress:o.programAddress});if(a[k]===1)return a}return{[k]:1,role:B.READONLY}}),!!o.accounts)for(let a of o.accounts)po(n,a.address,i=>{let{address:s,...c}=a;if(k in i)switch(i[k]){case 0:return i;case 1:{let u=dt(i.role,c.role);if(r.has(a.address)){if(te(c.role))throw new d(fe,{programAddress:a.address});return i.role!==u?{...i,role:u}:i}else return i.role!==u?{...i,role:u}:i}}return{...c,[k]:1}});return n}function zo(e){let t;return Object.entries(e).sort(([r,o],[a,i])=>{if(o[k]!==i[k]){if(o[k]===0)return-1;if(i[k]===0)return 1;if(o[k]===1)return-1;if(i[k]===1)return 1}let s=W(o.role);if(s!==W(i.role))return s?-1:1;let c=te(o.role);return c!==te(i.role)?c?-1:1:(t||=Pe(),t(r,a))}).map(([r,o])=>({address:r,...o}))}function Gn(e){let t=0,n=0,r=0;for(let o of e){if("lookupTableAddress"in o)break;let a=te(o.role);W(o.role)?(r++,a||n++):a||t++}return{numReadonlyNonSignerAccounts:t,numReadonlySignerAccounts:n,numSignerAccounts:r}}function Bo(e){let t={};for(let[n,r]of e.entries())t[r.address]=n;return t}function Gd(e,t){let n=Bo(t);return e.map(({accounts:r,data:o,programAddress:a})=>({programAddressIndex:n[a],...r?{accountIndices:r.map(({address:i})=>n[i])}:null,...o?{data:o}:null}))}function Wn(e){return"nonce"in e?e.nonce:e.blockhash}function Wd(e){let t=Po(e.feePayer.address,e.instructions),n=zo(t),r=n.length;if(r>64)throw new d(Le,{actualCount:r,maxAllowed:64});let o=n.filter(s=>W(s.role)).length;if(o>12)throw new d(De,{actualCount:o,maxAllowed:12});let a=e.instructions.length;if(a>64)throw new d(ve,{actualCount:a,maxAllowed:64});for(let s=0;s<e.instructions.length;s++){let c=e.instructions[s].accounts?.length??0;if(c>255)throw new d(ye,{actualCount:c,instructionIndex:s,maxAllowed:255})}let i=e.lifetimeConstraint;return{...i?{lifetimeToken:Wn(i)}:null,header:Gn(n),instructions:Gd(e.instructions,n),staticAccounts:n.map(s=>s.address),version:e.version}}function Co(e,t,n){e[t]=n(e[t]??{role:B.READONLY})}var C=Symbol("AddressMapTypeProperty");function $d(e,t){let n={[e]:{[C]:0,role:B.WRITABLE_SIGNER}},r=new Set;for(let o of t){Co(n,o.programAddress,i=>{if(r.add(o.programAddress),C in i){if(te(i.role))throw i[C]===0?new d(Ke,{programAddress:o.programAddress}):new d(fe,{programAddress:o.programAddress});if(i[C]===2)return i}return{[C]:2,role:B.READONLY}});let a;if(o.accounts)for(let i of o.accounts)Co(n,i.address,s=>{let{address:c,...u}=i;if(C in s)switch(s[C]){case 0:return s;case 1:{let _=dt(s.role,u.role);if("lookupTableAddress"in u){if(s.lookupTableAddress!==u.lookupTableAddress&&(a||=Pe())(u.lookupTableAddress,s.lookupTableAddress)<0)return{[C]:1,...u,role:_}}else if(W(u.role))return{[C]:2,role:_};return s.role!==_?{...s,role:_}:s}case 2:{let _=dt(s.role,u.role);if(r.has(i.address)){if(te(u.role))throw new d(fe,{programAddress:i.address});return s.role!==_?{...s,role:_}:s}else return"lookupTableAddress"in u&&!W(s.role)?{...u,[C]:1,role:_}:s.role!==_?{...s,role:_}:s}}return"lookupTableAddress"in u?{...u,[C]:1}:{...u,[C]:2}})}return n}function Hd(e){let t;return Object.entries(e).sort(([r,o],[a,i])=>{if(o[C]!==i[C]){if(o[C]===0)return-1;if(i[C]===0)return 1;if(o[C]===2)return-1;if(i[C]===2)return 1}let s=W(o.role);if(s!==W(i.role))return s?-1:1;let c=te(o.role);return c!==te(i.role)?c?-1:1:(t||=Pe(),o[C]===1&&i[C]===1&&o.lookupTableAddress!==i.lookupTableAddress?t(o.lookupTableAddress,i.lookupTableAddress):t(r,a))}).map(([r,o])=>({address:r,...o}))}function Kd(e){let t={};for(let n of e){if(!("lookupTableAddress"in n))continue;let r=t[n.lookupTableAddress]||={readonlyIndexes:[],writableIndexes:[]};n.role===B.WRITABLE?r.writableIndexes.push(n.addressIndex):r.readonlyIndexes.push(n.addressIndex)}return Object.keys(t).sort(Pe()).map(n=>({lookupTableAddress:n,...t[n]}))}function Yd(e){let t={};for(let[n,r]of e.entries())t[r.address]=n;return t}function jd(e,t){let n=Yd(t);return e.map(({accounts:r,data:o,programAddress:a})=>({programAddressIndex:n[a],...r?{accountIndices:r.map(({address:i})=>n[i])}:null,...o?{data:o}:null}))}function Xd(e){let t=e.findIndex(r=>"lookupTableAddress"in r);return(t===-1?e:e.slice(0,t)).map(({address:r})=>r)}function Zd(e){let t=$d(e.feePayer.address,e.instructions),n=Hd(t),r=n.length;if(r>64)throw new d(Le,{actualCount:r,maxAllowed:64});let o=n.filter(s=>W(s.role)).length;if(o>12)throw new d(De,{actualCount:o,maxAllowed:12});let a=e.instructions.length;if(a>64)throw new d(ve,{actualCount:a,maxAllowed:64});for(let s=0;s<e.instructions.length;s++){let c=e.instructions[s].accounts?.length??0;if(c>255)throw new d(ye,{actualCount:c,instructionIndex:s,maxAllowed:255})}let i=e.lifetimeConstraint;return{addressTableLookups:Kd(n),...i?{lifetimeToken:Wn(i)}:null,header:Gn(n),instructions:jd(e.instructions,n),staticAccounts:Xd(n),version:e.version}}function qd(e){let t=0;return e.priorityFeeLamports!==void 0&&(t|=Un),e.computeUnitLimit!==void 0&&(t|=bo),e.loadedAccountsDataSizeLimit!==void 0&&(t|=Mo),e.heapSize!==void 0&&(t|=xo),t}function Jd(e){let t=[];return e.priorityFeeLamports!==void 0&&t.push({kind:"u64",value:e.priorityFeeLamports}),e.computeUnitLimit!==void 0&&t.push({kind:"u32",value:e.computeUnitLimit}),e.loadedAccountsDataSizeLimit!==void 0&&t.push({kind:"u32",value:e.loadedAccountsDataSizeLimit}),e.heapSize!==void 0&&t.push({kind:"u32",value:e.heapSize}),t}function Qd(e,t){return{numInstructionAccounts:e.accounts?.length??0,numInstructionDataBytes:e.data?.byteLength??0,programAccountIndex:t[e.programAddress]}}function e_(e,t){return{instructionAccountIndices:e.accounts?.map(({address:n})=>t[n])??[],instructionData:e.data??new Uint8Array}}function t_(e){let t=Po(e.feePayer.address,e.instructions),n=zo(t),r=n.length;if(r>64)throw new d(Le,{actualCount:r,maxAllowed:64});let o=n.filter(c=>W(c.role)).length;if(o>12)throw new d(De,{actualCount:o,maxAllowed:12});let a=e.instructions.length;if(a>64)throw new d(ve,{actualCount:a,maxAllowed:64});for(let c=0;c<e.instructions.length;c++){let u=e.instructions[c].accounts?.length??0;if(u>255)throw new d(ye,{actualCount:u,instructionIndex:c,maxAllowed:255})}let i=Bo(n),s=e.lifetimeConstraint;return{version:1,...s?{lifetimeToken:Wn(s)}:null,configMask:qd(e.config??{}),configValues:Jd(e.config??{}),header:Gn(n),instructionHeaders:e.instructions.map(c=>Qd(c,i)),instructionPayloads:e.instructions.map(c=>e_(c,i)),numInstructions:e.instructions.length,numStaticAccounts:n.length,staticAccounts:n.map(c=>c.address)}}function ko(e){let t=e.version;if(t==="legacy")return Wd(e);if(t===0)return Zd(e);if(t===1)return t_(e);throw new d(ae,{version:t})}function Ie(e,t){return n_([e],t)}function n_(e,t){return Object.freeze({...t,instructions:Object.freeze([...t.instructions,...e])})}function $n(e){return Object.freeze({instructions:Object.freeze([]),version:e.version})}function Hn(e,t){if("feePayer"in t&&e===t.feePayer?.address&&r_(t.feePayer))return t;let n={...t,feePayer:Object.freeze({address:e})};return Object.freeze(n),n}function r_(e){return!!e&&"address"in e&&typeof e.address=="string"&&Object.keys(e).length===1}var o_="SysvarRecentB1ockHashes11111111111111111111",a_="11111111111111111111111111111111";function i_(e){return e.programAddress===a_&&e.data!=null&&s_(e.data)&&e.accounts?.length===3&&e.accounts[0].address!=null&&e.accounts[0].role===B.WRITABLE&&e.accounts[1].address===o_&&e.accounts[1].role===B.READONLY&&e.accounts[2].address!=null&&W(e.accounts[2].role)}function s_(e){return e.byteLength===4&&e[0]===4&&e[1]===0&&e[2]===0&&e[3]===0}function Fo(e){return"lifetimeConstraint"in e&&typeof e.lifetimeConstraint.nonce=="string"&&e.instructions[0]!=null&&i_(e.instructions[0])}var Be=Object.freeze({name:"Ed25519"});function c_(e){return new Uint8Array([48,46,2,1,0,48,5,6,3,43,101,112,4,34,4,32,...e])}async function u_(e,t=!1){let n=e.byteLength;if(n!==32)throw new d(Mt,{actualLength:n});let r=c_(e);return await crypto.subtle.importKey("pkcs8",r,Be,t,["sign"])}async function ke(e,t){eo();let n=await crypto.subtle.sign(Be,e,ge(t));return new Uint8Array(n)}async function d_(e,t,n){return to(),await crypto.subtle.verify(Be,e,ge(t),ge(n))}async function Vo(e=!1){return await Qr(),await crypto.subtle.generateKey(Be,e,["sign","verify"])}async function Go(e,t=!1){if(qr(),e.byteLength!==64)throw new d(bt,{byteLength:e.byteLength});let[n,r]=await Promise.all([crypto.subtle.importKey("raw",e.slice(32),Be,!0,["verify"]),u_(e.slice(0,32),t)]),o=new Uint8Array(32);crypto.getRandomValues(o);let a=await ke(r,o);if(!await d_(n,a,o))throw new d(xt);return{privateKey:r,publicKey:n}}function Wo(e){let t=Object.values(e);if(t.length===0)throw new d(Vt);return t.map(n=>n||new Uint8Array(64).fill(0))}function __(){return m(b(J(re(),64),{size:K()}),Wo)}function A_(e){return m(b(J(re(),64),{description:"signatures",size:e}),Wo)}var l_=128,f_=127;function R_(e){if(e.length===0)throw new d(Wt);return Ne().decode(e)===1?"messageFirst":"signaturesFirst"}function g_(e){if(e.length===0)throw new d($t);let t=e[0];if((t&l_)===0)return"signaturesFirst";let n=t&f_;if(n===0)throw new d(Ht,{firstByte:t,transactionBytes:e});if(n===1)return"messageFirst";throw new d(ae,{unsupportedVersion:n})}function Fe(){return So(e=>R_(e.messageBytes)==="signaturesFirst",E_(),S_())}function E_(){return L([["signatures",__()],["messageBytes",re()]])}function Yn(e,t){if(e.length<t+2)throw new d(Gt,{messageBytes:e});return e[t+1]}function S_(){let e=re();return I({getSizeFromValue:t=>{let n=Yn(t.messageBytes,0);return t.messageBytes.length+n*64},write:(t,n,r)=>{r=e.write(t.messageBytes,n,r);let o=Yn(t.messageBytes,0);return r=A_(o).write(t.signatures,n,r),r}})}function Ve(){return mo(e=>g_(e)==="signaturesFirst",m_(),O_())}function m_(){return w(x([["signatures",M(H(ce(),64),{size:G()})],["messageBytes",ce()]]),I_)}function O_(){return w(N_(),T_)}function N_(){return S({read(e,t){let n=Yn(e,t),r=n*64,o=e.length-t-r;if(o<0)throw new d(Kt,{numExpectedSignatures:n,transactionBytes:e.subarray(t),transactionBytesLength:e.length-t});let a=e.subarray(t,t+o),[i,s]=M(H(ce(),64),{size:n}).read(e,t+o);return[{messageBytes:a,signatures:i},s]}})}function I_(e){let{messageBytes:t,signatures:n}=e,r=le([Ne(),Yr(p(),2),M(T(),{size:G()})]),[o,a,i]=r.decode(t),s=i.slice(0,a);if(s.length!==n.length)throw new d(Ye,{numRequiredSignatures:a,signaturesLength:n.length,signerAddresses:s});let c=$o(s,n);return{messageBytes:t,signatures:Object.freeze(c)}}function T_(e){let{messageBytes:t,signatures:n}=e,r=t[1],a=M(T(),{size:r}).decode(t,42);if(a.length!==n.length)throw new d(Ye,{numRequiredSignatures:r,signaturesLength:n.length,signerAddresses:a});let i=$o(a,n);return{messageBytes:t,signatures:i}}function $o(e,t){let n={};return e.forEach((r,o)=>{let a=t[o];a.every(i=>i===0)?n[r]=null:n[r]=a}),Object.freeze(n)}function _t(e){let t=ko(e),n=Uo().encode(t),r=t.staticAccounts.slice(0,t.header.numSignerAccounts),o={};for(let i of r)o[i]=null;let a;return Do(e)?a={blockhash:e.lifetimeConstraint.blockhash,lastValidBlockHeight:e.lifetimeConstraint.lastValidBlockHeight}:Fo(e)&&(a={nonce:e.lifetimeConstraint.nonce,nonceAccountAddress:e.instructions[0].accounts[0].address}),Object.freeze({...a?{lifetimeConstraint:a}:void 0,messageBytes:n,signatures:Object.freeze(o)})}var Kn;function At(e){Kn||(Kn=Je());let t=Object.values(e.signatures)[0];if(!t)throw new d(kt);return Kn.decode(t)}async function jn(e,t){let n,r;if(await Promise.all(e.map(async o=>{let a=await tt(o.publicKey),i=t.signatures[a];if(i===void 0){r||=new Set,r.add(a);return}if(r)return;let s=await ke(o.privateKey,t.messageBytes);i!==null&&je(s,i)||(n||={},n[a]=s)})),r&&r.size>0){let o=Object.keys(t.signatures);throw new d(Ft,{expectedAddresses:o,unexpectedAddresses:[...r]})}return n?Object.freeze({...t,signatures:Object.freeze({...t.signatures,...n})}):t}async function Ho(e,t){let n=await jn(e,t);return Ko(n),Object.freeze(n),n}function Ko(e){let t=[];if(Object.entries(e.signatures).forEach(([n,r])=>{r||t.push(n)}),t.length>0)throw new d(Bt,{addresses:t})}function h_(e){return"modifyAndSignTransactions"in e&&typeof e.modifyAndSignTransactions=="function"}function p_(e){return"signTransactions"in e&&typeof e.signTransactions=="function"}function C_(e){return"signAndSendTransactions"in e&&typeof e.signAndSendTransactions=="function"}function Yo(e){return p_(e)||h_(e)||C_(e)}async function jo(e){let t=await tt(e.publicKey);return Object.freeze({address:t,keyPair:e,signMessages:r=>Promise.all(r.map(async o=>Object.freeze({[t]:await ke(e.privateKey,o.content)}))),signTransactions:r=>Promise.all(r.map(async o=>{let a=await jn([e],o);return Object.freeze({[t]:a.signatures[t]})}))})}async function Xn(e=!1){return await jo(await Vo(e))}async function Xo(e,t){return await jo(await Go(e,t))}function Zn(e){return Object.freeze({address:e,signMessages:n=>Promise.resolve(n.map(()=>Object.freeze({}))),signTransactions:n=>Promise.resolve(n.map(()=>Object.freeze({})))})}var Tl=globalThis.TextEncoder;function qn(e,t){if(t==null)throw new d(fn,{inputName:e});return t}function Zo(e,t){let n=qn(e,t);return typeof t=="object"&&"address"in n?n.address:Array.isArray(n)?n[0]:n}function Ge(e,t){return(n,r)=>{if(!r.value)return t==="omitted"?void 0:Object.freeze({address:e,role:B.READONLY});if(D_(r.value))return Object.freeze({address:r.value.address,role:r.value.role,..."signer"in r.value&&r.value.signer?{signer:r.value.signer}:{}});let o=r.isSigner??"either",a=o!==!1&&L_(r.value);if(!a&&o===!0)throw new d(Rn,{inputName:n});let i=r.isWritable?B.WRITABLE:B.READONLY;return Object.freeze({address:Zo(n,r.value),role:a?No(i):i,...a?{signer:r.value}:{}})}}function D_(e){return typeof e=="object"&&"role"in e&&typeof e.role=="number"}function L_(e){return!!e&&typeof e=="object"&&"address"in e&&typeof e.address=="string"&&Yo(e)}var G_=2;function W_(){return m(L([["discriminator",ie()],["amount",Ee()]]),e=>({...e,discriminator:G_}))}function Jn(){return x([["discriminator",F()],["amount",ee()]])}function qo(e,t){let n=t?.programAddress??$_,r=Ge(n,"omitted"),a={source:{value:e.source??null,isSigner:!0,isWritable:!0},destination:{value:e.destination??null,isSigner:!1,isWritable:!0}},i={...e};return Object.freeze({accounts:[r("source",a.source),r("destination",a.destination)],data:W_().encode(i),programAddress:n})}var $_="11111111111111111111111111111111";function Jo(){return x([["mintAuthority",Oe(T(),{prefix:F(),noneValue:"zeroes"})],["supply",ee()],["decimals",p()],["isInitialized",it()],["freezeAuthority",Oe(T(),{prefix:F(),noneValue:"zeroes"})]])}var Qo=(e=>(e[e.Uninitialized=0]="Uninitialized",e[e.Initialized=1]="Initialized",e[e.Frozen=2]="Frozen",e))(Qo||{});function H_(){return Tn(Qo)}function ea(){return x([["mint",T()],["owner",T()],["amount",ee()],["delegate",Oe(T(),{prefix:F(),noneValue:"zeroes"})],["state",H_()],["isNative",Oe(ee(),{prefix:F(),noneValue:"zeroes"})],["delegatedAmount",ee()],["closeAuthority",Oe(T(),{prefix:F(),noneValue:"zeroes"})]])}async function ta(e,t={}){let{programAddress:n="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"}=t;return await ao({programAddress:n,seeds:[z().encode(e.owner),z().encode(e.tokenProgram),z().encode(e.mint)]})}var K_=1;function Y_(){return m(L([["discriminator",D()]]),e=>({...e,discriminator:K_}))}function na(e,t){let n=t?.programAddress??Qn,r=Ge(n,"programId"),a={payer:{value:e.payer??null,isSigner:!0,isWritable:!0},ata:{value:e.ata??null,isSigner:!1,isWritable:!0},owner:{value:e.owner??null,isSigner:!1,isWritable:!1},mint:{value:e.mint??null,isSigner:!1,isWritable:!1},systemProgram:{value:e.systemProgram??null,isSigner:!1,isWritable:!1},tokenProgram:{value:e.tokenProgram??null,isSigner:!1,isWritable:!1}};return a.tokenProgram.value||(a.tokenProgram.value="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),a.systemProgram.value||(a.systemProgram.value="11111111111111111111111111111111"),Object.freeze({accounts:[r("payer",a.payer),r("ata",a.ata),r("owner",a.owner),r("mint",a.mint),r("systemProgram",a.systemProgram),r("tokenProgram",a.tokenProgram)],data:Y_().encode({}),programAddress:n})}var j_=12;function X_(){return m(L([["discriminator",D()],["amount",Ee()],["decimals",D()]]),e=>({...e,discriminator:j_}))}function ra(){return x([["discriminator",p()],["amount",ee()],["decimals",p()]])}function oa(e,t){let n=t?.programAddress??lt,r=Ge(n,"programId"),a={source:{value:e.source??null,isSigner:!1,isWritable:!0},mint:{value:e.mint??null,isSigner:!1,isWritable:!1},destination:{value:e.destination??null,isSigner:!1,isWritable:!0},authority:{value:e.authority??null,isSigner:"either",isWritable:!1}},i={...e},s=(i.multiSigners??[]).map(c=>qn("multiSigners",r("multiSigners",{value:c,isSigner:!0,isWritable:!1})));return Object.freeze({accounts:[r("source",a.source),r("mint",a.mint),r("destination",a.destination),r("authority",a.authority),...s],data:X_().encode(i),programAddress:n})}var Qn="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";var lt="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";var Y="11111111111111111111111111111111",j="MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",aa="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",$=String(lt),he=String(Qn),Te=Object.freeze({devnet:aa,"mainnet-beta":"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"}),oe=e=>btoa(String.fromCharCode(...e)),U=e=>{if(typeof e!="string"||e.length>4096||!/^[A-Za-z0-9+/]*={0,2}$/.test(e))throw Error("Invalid transaction encoding");let t=Uint8Array.from(atob(e),n=>n.charCodeAt(0));if(oe(t)!==e||t.length>1232)throw Error("Noncanonical or oversized transaction");return t},Rt=(e,t)=>e.length===t.length&&e.every((n,r)=>n===t[r]),X=e=>String(O(String(e))),Z_=()=>Xn(!1),q_=()=>Xn(!0),J_=e=>new Uint8Array(xe().encode(e)),ia=e=>new Uint8Array(z().encode(O(e)));async function Q_(e){let t=await crypto.subtle.exportKey("jwk",e.keyPair.privateKey),n=r=>Uint8Array.from(atob(r.replaceAll("-","+").replaceAll("_","/")),o=>o.charCodeAt(0));return new Uint8Array([...n(t.d),...n(t.x)])}async function eA(e){let t;try{if(typeof e=="string"&&e.length>4096||(typeof e=="string"&&(e=e.trim().startsWith("[")?JSON.parse(e):xe().encode(e.trim())),!e||e.length!==64||!Array.from(e).every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw Error();return t=Uint8Array.from(e),await Xo(t,!1)}catch{throw Error("Use a valid 64-byte Solana keypair JSON array or base58 private key. Recovery phrases are not supported.")}finally{t?.fill(0)}}function nr(e){let t=U(e),n=Ve().decode(t);if(!Rt(t,Fe().encode(n)))throw Error("Noncanonical transaction bytes");return oe(n.messageBytes)}function rr({sender:e,recipient:t,amountLamports:n,blockhash:r,lastValidBlockHeight:o,memo:a="",references:i=[]}){if(X(e),X(t),!/^[1-9][0-9]*$/.test(String(n))||BigInt(n)>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Use a positive, safe integer lamport amount");if(!Number.isSafeInteger(Number(o))||Number(o)<1)throw Error("Invalid blockhash lifetime");if(typeof a!="string"||new TextEncoder().encode(a).length>180||/[\x00-\x1f]/.test(a))throw Error("Memo must be at most 180 UTF-8 bytes without control characters");i=$e(i,[e,t,Y,j]);let s=qo({source:Zn(O(e)),destination:O(t),amount:BigInt(n)}),c=ut($n({version:"legacy"}),_=>Hn(O(e),_),_=>Pn({blockhash:pn(r),lastValidBlockHeight:BigInt(o)},_),_=>Ie({...s,accounts:[...s.accounts,...i.map(A=>({address:O(A),role:0}))]},_));a&&(c=Ie({programAddress:O(j),accounts:[],data:new TextEncoder().encode(a)},c));let u=_t(c);return{messageBytesBase64:oe(u.messageBytes),transactionBase64:oe(Fe().encode(u)),sender:e,recipient:t,amountLamports:Number(n),blockhash:r,lastValidBlockHeight:Number(o),memo:a,programIds:a?[Y,j]:[Y],...i.length?{references:i}:{}}}function sa(e){let t=U(e),n=ze().decode(t);if(n.version!=="legacy"||n.header.numSignerAccounts!==1||![1,2].includes(n.instructions.length))throw Error("This provider supports one SOL transfer and an optional memo");let[r,o]=n.instructions;if(n.staticAccounts[r.programAddressIndex]!==Y||r.accountIndices.length<2||r.accountIndices.length>6||r.data.length!==12)throw Error("Expected a standard System Program transfer");let a=Jn().decode(r.data);if(a.discriminator!==2)throw Error("Unsupported System Program instruction");let i="";if(o){if(n.staticAccounts[o.programAddressIndex]!==j||(o.accountIndices||[]).length)throw Error("Unsupported extra instruction");i=new TextDecoder("utf-8",{fatal:!0}).decode(o.data)}let s=rr({sender:n.staticAccounts[r.accountIndices[0]],recipient:n.staticAccounts[r.accountIndices[1]],amountLamports:a.amount.toString(),blockhash:n.lifetimeToken,lastValidBlockHeight:1,memo:i,references:Array.from(r.accountIndices).slice(2).map(c=>n.staticAccounts[c])});if(!Rt(U(s.messageBytesBase64),t))throw Error("Message does not match the canonical reviewed transfer");return delete s.lastValidBlockHeight,delete s.transactionBase64,s}async function tA(e,t){let n=Ve().decode(U(t)),r=await ua(oe(n.messageBytes));if(e.address!==r.sender)throw Error("This wallet is not the transfer sender");let o=await Ho([e.keyPair],n);return{signedTransactionBase64:oe(Fe().encode(o)),signature:String(At(o))}}function ue(e,{positive:t=!1}={}){if(typeof e!="string"||!/^(0|[1-9][0-9]{0,19})$/.test(e)||BigInt(e)>18446744073709551615n||t&&e==="0")throw Error("Use an exact unsigned 64-bit atomic amount string");return e}function We(e){if(!Number.isInteger(e)||e<0||e>18)throw Error("This payment provider supports 0\u201318 token decimals");return e}function or(e,t){if(ue(e),We(t),!t)return e;let n=e.padStart(t+1,"0");return(n.slice(0,-t)+"."+n.slice(-t)).replace(/\.?0+$/,"")}function nA(e,t){if(We(t),typeof e!="string"||e.length>40||!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(e))throw Error("Use a decimal amount without exponent notation");let[n,r=""]=e.split(".");if(r.length>t)throw Error("Amount has more decimal places than the asset");return ue((n+r.padEnd(t,"0")).replace(/^0+(?=\d)/,""),{positive:!0})}function ar(e,t={kind:"native"}){if(!Object.hasOwn(Te,e))throw Error("Choose devnet or mainnet-beta");if(!t||typeof t!="object"||Array.isArray(t))throw Error("Use an asset descriptor");if(t.network!=null&&t.network!==e||t.genesisHash!=null&&t.genesisHash!==Te[e])throw Error("Asset belongs to another network");if(t.kind==="native"){if(t.mint!=null||t.tokenProgram!=null||t.decimals!=null&&t.decimals!==9)throw Error("Native SOL has 9 decimals and no token mint");return{protocol:"capp.solana-asset.v1",kind:"native",network:e,genesisHash:Te[e],decimals:9}}if(t.kind!=="spl-token"||t.tokenProgram!==$)throw Error("Only the original SPL Token Program is supported; Token-2022 requires a separate extension-aware provider");let n=X(t.mint);if(n==="So11111111111111111111111111111111111111112")throw Error("Use native SOL; wrapping and unwrapping are separate operations");return{protocol:"capp.solana-asset.v1",kind:"spl-token",network:e,genesisHash:Te[e],mint:n,tokenProgram:$,decimals:We(t.decimals)}}function $e(e,t=[]){if(!Array.isArray(e)||e.length>4)throw Error("Use at most four payment references");let n=e.map(X);if(new Set(n).size!==n.length||n.some(r=>t.includes(r)))throw Error("Payment references must be distinct read-only accounts");return n}async function ft(e,t){return String((await ta({owner:O(X(e)),mint:O(X(t)),tokenProgram:lt}))[0])}async function ca({sender:e,recipient:t,asset:n,amountAtomic:r,blockhash:o,lastValidBlockHeight:a,memo:i="",references:s=[],createRecipientAccount:c=!0}){if(e=X(e),t=X(t),n=ar(n?.network,n),ue(r,{positive:!0}),n.kind!=="spl-token"||e===t)throw Error("Choose a different recipient for a token payment");rr({sender:e,recipient:t,amountLamports:1,blockhash:o,lastValidBlockHeight:a,memo:i});let u=await ft(e,n.mint),_=await ft(t,n.mint);s=$e(s,[e,t,n.mint,u,_,$,he,Y,j]);let A=Zn(O(e)),E=ut($n({version:"legacy"}),l=>Hn(O(e),l),l=>Pn({blockhash:pn(o),lastValidBlockHeight:BigInt(a)},l));c&&(E=Ie(na({payer:A,ata:O(_),owner:O(t),mint:O(n.mint)}),E));let f=oa({source:O(u),mint:O(n.mint),destination:O(_),authority:A,amount:BigInt(r),decimals:n.decimals});E=Ie({...f,accounts:[...f.accounts,...s.map(l=>({address:O(l),role:0}))]},E),i&&(E=Ie({programAddress:O(j),accounts:[],data:new TextEncoder().encode(i)},E));let h=_t(E),R={messageBytesBase64:oe(h.messageBytes),transactionBase64:oe(Fe().encode(h)),sender:e,recipient:t,asset:n,amountAtomic:r,sourceTokenAccount:u,destinationTokenAccount:_,createRecipientAccount:!!c,blockhash:o,lastValidBlockHeight:Number(a),memo:i,references:s,programIds:[...c?[he,Y]:[],$,...i?[j]:[]]};return U(R.transactionBase64),R}async function ua(e,{network:t="devnet",recipient:n}={}){let r=U(e),o=ze().decode(r);if(o.instructions[0]&&o.staticAccounts[o.instructions[0].programAddressIndex]===Y)return sa(e);if(o.version!=="legacy"||o.header.numSignerAccounts!==1||o.instructions.length<1||o.instructions.length>3)throw Error("Unsupported token payment message");let a=[...o.instructions],i=o.staticAccounts[a[0].programAddressIndex]===he?a.shift():null,s=a.shift(),c=a.shift();if(o.staticAccounts[s.programAddressIndex]!==$||s.data.length!==10||s.accountIndices.length<4||s.accountIndices.length>8)throw Error("Expected one SPL TransferChecked instruction");let u=ra().decode(s.data);if(u.discriminator!==12)throw Error("Expected TransferChecked");let _=n,A="";if(i){if(i.data.length!==1||i.data[0]!==1||i.accountIndices.length!==6)throw Error("Expected idempotent associated account creation");if(_=o.staticAccounts[i.accountIndices[2]],n&&_!==n)throw Error("Recipient differs from the expected payment")}if(!_)throw Error("A trusted recipient is required for a transfer without account creation");if(c){if(o.staticAccounts[c.programAddressIndex]!==j||(c.accountIndices||[]).length)throw Error("Unsupported extra instruction");A=new TextDecoder("utf-8",{fatal:!0}).decode(c.data)}let E=await ca({sender:o.staticAccounts[s.accountIndices[3]],recipient:_,asset:{kind:"spl-token",network:t,mint:o.staticAccounts[s.accountIndices[1]],tokenProgram:$,decimals:u.decimals},amountAtomic:u.amount.toString(),blockhash:o.lifetimeToken,lastValidBlockHeight:1,memo:A,createRecipientAccount:!!i,references:Array.from(s.accountIndices).slice(4).map(f=>o.staticAccounts[f])});if(!Rt(U(E.messageBytesBase64),r))throw Error("Message does not match the canonical reviewed token transfer");return delete E.lastValidBlockHeight,delete E.transactionBase64,E}function da(e,t){if(e===null)throw Error("The token account does not exist on this network");if(!e||e.owner!==$||e.executable!==!1)throw Error("This is not an original SPL Token Program account: check its program owner and executable flag");if(!Array.isArray(e.data)||e.data[1]!=="base64")throw Error("The RPC did not return base64 token account data");let n=U(e.data[0]);if(n.length!==t)throw Error("Unsupported token account layout or extension");return n}function _a(e){let t=Jo().decode(da(e,82));if(!t.isInitialized)throw Error("Token mint is not initialized");return{decimals:We(t.decimals),supplyAtomic:t.supply.toString(),mintAuthority:t.mintAuthority.__option==="Some"?String(t.mintAuthority.value):null,freezeAuthority:t.freezeAuthority.__option==="Some"?String(t.freezeAuthority.value):null}}function er(e){let t=ea().decode(da(e,165));if(t.state!==1||t.isNative.__option!=="None")throw Error("Token account is frozen, uninitialized or wrapped SOL");return{mint:String(t.mint),owner:String(t.owner),amountAtomic:t.amount.toString()}}async function rA(e,t){let{asset:n,sender:r,recipient:o,sourceTokenAccount:a,destinationTokenAccount:i,amountAtomic:s}=t,c=await e("getMultipleAccounts",[[n.mint,a,i],{encoding:"base64",commitment:"confirmed"}]);if(!c||!Number.isSafeInteger(c.context?.slot)||!Array.isArray(c.value)||c.value.length!==3)throw Error("Invalid token account observation");let[u,_,A]=c.value;if(u===null)throw Error(`The mint ${n.mint} does not exist on ${n.network}. Check the mint and network.`);if(_===null)throw Object.assign(Error(`The payer ${r} has no associated token account for mint ${n.mint}. Obtain this token in that wallet before preparing; SOL only pays fees and rent.`),{code:"TOKEN_SOURCE_MISSING"});let E=(g,Z,v)=>{try{return v(Z)}catch(y){throw Error(`${g}: ${y.message}`)}},f=E("Mint account",u,_a),h=E("Payer token account",_,er),R=A===null?null:E("Recipient token account",A,er);if(f.decimals!==n.decimals||h.mint!==n.mint||h.owner!==r||R&&(R.mint!==n.mint||R.owner!==o))throw Error("Token mint, decimals or account owner do not match the reviewed payment");if(BigInt(h.amountAtomic)<BigInt(s))throw Error("The selected source token account has insufficient tokens");if(!R&&!t.createRecipientAccount)throw Error("The recipient token account does not exist");let l=R?0:await e("getMinimumBalanceForRentExemption",[165,{commitment:"confirmed"}]);if(!Number.isSafeInteger(l)||l<0)throw Error("Invalid account rent observation");return{slot:c.context.slot,mint:f,source:h,destination:R,recipientAccountExists:!!R,rentLamports:l}}function oA(e,t,n){if(typeof e!="string"||e.length>16384)throw Error("Configure token limits as a bounded JSON array");let r;try{r=JSON.parse(e)}catch{throw Error("Token limits must be a JSON array")}if(!Array.isArray(r)||r.length>32)throw Error("Configure at most 32 token mint limits");let o=new Set;for(let i of r){if(X(i?.mint),ue(i?.maxAmountAtomic,{positive:!0}),o.has(i.mint))throw Error("Duplicate token mint limit");o.add(i.mint)}let a=r.find(i=>i.mint===t);if(!a||BigInt(ue(n,{positive:!0}))>BigInt(a.maxAmountAtomic))throw Error("Token mint is not allowed or its atomic amount exceeds the configured limit");return a.maxAmountAtomic}function aA(e){return e.asset?.kind==="spl-token"?`Amount: ${or(e.amountAtomic,e.asset.decimals)} tokens (${e.amountAtomic} atomic units)
Mint: ${e.asset.mint}
Token program: ${e.asset.tokenProgram}
Source token account: ${e.sourceTokenAccount}
Recipient token account: ${e.destinationTokenAccount}
Account creation may require SOL rent; transaction fees are paid in SOL.`:`Amount: ${e.amountLamports} lamports`}var tr=e=>JSON.stringify(e,(t,n)=>n&&typeof n=="object"&&!Array.isArray(n)?Object.fromEntries(Object.keys(n).sort().map(r=>[r,n[r]])):n),Aa=async e=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(tr(e)))),t=>t.toString(16).padStart(2,"0")).join(""),iA=()=>String(T().decode(crypto.getRandomValues(new Uint8Array(32))));function sA(e){if(typeof e!="string"||!/^[a-f0-9]{64}$/.test(e))throw Error("Expected a SHA-256 digest");return String(T().decode(Uint8Array.from(e.match(/../g),t=>parseInt(t,16))))}async function la(e){if(!e||typeof e!="object"||Array.isArray(e))throw Error("Use a payment request object");let{requestId:t,network:n,createdAt:r,expiresAt:o}=e;if(typeof t!="string"||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(t))throw Error("Use a stable payment request ID");if(!Number.isSafeInteger(r)||r<1||!Number.isSafeInteger(o)||o<=r||o-r>604800)throw Error("Use explicit Unix-second creation/expiry times within seven days");let a=X(e.recipient),i=ar(n,e.asset),s=ue(e.amountAtomic,{positive:!0});if(i.kind==="native"&&BigInt(s)>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Native SOL amounts must remain safe integer lamports");let c=$e([e.reference],[a,Y,j,$,he,i.mint].filter(Boolean))[0],u=e.label??"",_=e.message??"",A=e.memo??"";for(let[R,l,g]of[["label",u,80],["message",_,160],["memo",A,120]])if(typeof l!="string"||new TextEncoder().encode(l).length>g||/[\x00-\x1f\x7f]/.test(l))throw Error("Invalid payment "+R);let E={protocol:"capp.solana-payment-request.v1",requestId:t,network:n,genesisHash:Te[n],recipient:a,asset:i,amountAtomic:s,reference:c,createdAt:r,expiresAt:o,label:u,message:_,memo:A},f=new URLSearchParams({amount:or(s,i.decimals)});i.kind==="spl-token"&&f.set("spl-token",i.mint),f.append("reference",c);for(let[R,l]of[["label",u],["message",_],["memo",A]])l&&f.set(R,l);let h=await Aa(E);if(e.requestDigest!=null&&e.requestDigest!==h)throw Error("Payment request digest does not match its terms");return{...E,requestDigest:h,uri:`solana:${a}?${f.toString()}`}}async function cA(e,t){let n=ze().decode(U(e));if(!["legacy",0].includes(n.version)||(n.addressTableLookups||[]).length||n.instructions.length>6)throw Error("Unsupported payment transaction version or instructions");let r=n.staticAccounts,o=n.header.numSignerAccounts,a=f=>f<o?f<o-n.header.numReadonlySignerAccounts:f<r.length-n.header.numReadonlyNonSignerAccounts,i=f=>{if(!Number.isInteger(f)||f<0||f>=r.length)throw Error("Invalid payment account index");return String(r[f])},s="ComputeBudget111111111111111111111111111111",c=null,u="",_=!1,A=null,E=new Set;for(let f of n.instructions){let h=i(f.programAddressIndex),R=Array.from(f.accountIndices||[]),l=R.map(i),g=f.data||new Uint8Array;if(h===s){if(l.length||!g||!(g[0]===2&&g.length===5||g[0]===3&&g.length===9)||E.has(g[0]))throw Error("Unsupported compute budget instruction");E.add(g[0]);continue}if(h===j){if(_||g.length>180||R.some(y=>y>=o))throw Error("Unsupported payment memo");u=new TextDecoder("utf-8",{fatal:!0}).decode(g),_=!0;continue}if(h===he){if(A||c||t.asset.kind!=="spl-token"||![6,7].includes(l.length)||!(g.length===0||g.length===1&&[0,1].includes(g[0])))throw Error("Unsupported recipient account creation");A={accounts:l};continue}if(c)throw Error("Expected exactly one payment transfer");let Z;if(h===Y&&t.asset.kind==="native"){if(g.length!==12||l.length<2)throw Error("Expected a native SOL transfer");let y=Jn().decode(g);if(y.discriminator!==2)throw Error("Unsupported System Program instruction");if(c={sender:l[0],recipient:l[1],amountAtomic:y.amount.toString()},Z=2,R[0]>=o||!a(R[0])||!a(R[1]))throw Error("Invalid transfer permissions")}else if(h===$&&t.asset.kind==="spl-token"){let y=g[0]===12&&g.length===10,fa=g[0]===3&&g.length===9;if(!y&&!fa||l.length<(y?4:3))throw Error("Expected SPL Transfer or TransferChecked");let gt=l[y?2:1],ir=R[y?3:2];if(y&&(l[1]!==t.asset.mint||g[9]!==t.asset.decimals))throw Error("TransferChecked mint or decimals differ from the request");if(ir>=o||!a(R[0])||!a(R[y?2:1]))throw Error("Invalid token transfer permissions");if(gt!==await ft(t.recipient,t.asset.mint))throw Error("Token payment uses another recipient account");if(c={sender:i(ir),recipient:t.recipient,asset:t.asset,sourceTokenAccount:l[0],destinationTokenAccount:gt,amountAtomic:new DataView(g.buffer,g.byteOffset,g.byteLength).getBigUint64(1,!0).toString(),createRecipientAccount:!!A},Z=y?4:3,A){let de=A.accounts;if(de[1]!==gt||de[2]!==t.recipient||de[3]!==t.asset.mint||de[4]!==Y||de[5]!==$||de.length===7&&de[6]!=="SysvarRent111111111111111111111111111111111")throw Error("Account creation differs from the expected recipient")}}else throw Error("Unsupported instruction in the observed payment");let v=R.slice(Z);if(v.length>4||v.some(y=>y<o||a(y)))throw Error("Payment references must be read-only and non-signing");c.references=$e(v.map(i))}if(!c)throw Error("No supported payment transfer");if(A&&!c.asset)throw Error("Unexpected token account creation");return{...c,memo:u}}async function uA(e,t,n){let r=Ve().decode(U(e));if(String(At(r))!==n)throw Error("Observed transaction signature does not match");let o=Object.entries(r.signatures);if(!o.length||o.length>4)throw Error("Unsupported payment signer count");for(let[a,i]of o){if(!i)throw Error("Missing payment signature");let s=await crypto.subtle.importKey("raw",ia(a),{name:"Ed25519"},!1,["verify"]);if(!await crypto.subtle.verify("Ed25519",s,i,U(t)))throw Error("Invalid payment signature")}}async function dA({paymentRequest:e,signature:t,transaction:n,meta:r,slot:o,blockTime:a,confirmationStatus:i,genesisHash:s,commitment:c="finalized"}){let u=await la(e);if(s!==u.genesisHash)throw Error("Payment observation belongs to another network");if(!["confirmed","finalized"].includes(c)||!["confirmed","finalized"].includes(i)||c==="finalized"&&i!=="finalized")throw Error("Payment has not reached the requested confirmation");if(!r||r.err!==null||!Number.isSafeInteger(o)||o<1)throw Error("A successful chain transaction is required");if(!Number.isSafeInteger(a)||a<u.createdAt||a>u.expiresAt)throw Error("Payment timestamp is unavailable or outside the request lifetime");if(!Array.isArray(n)||n[1]!=="base64")throw Error("Expected raw transaction bytes from RPC");let _=nr(n[0]),A=await cA(_,u);if(A.recipient!==u.recipient||A.sender===u.recipient)throw Error("A payment must credit the requested recipient from another sender");if(await uA(n[0],_,t),!(A.references||[]).includes(u.reference)||u.memo&&A.memo!==u.memo)throw Error("Payment reference or memo does not match the request");let E=ze().decode(U(_)),f;if(u.asset.kind==="native"){if(A.asset||A.amountAtomic!==u.amountAtomic)throw Error("Payment asset or amount differs from the request");let R=E.staticAccounts.indexOf(O(u.recipient)),l=r.preBalances?.[R],g=r.postBalances?.[R];if(!Number.isSafeInteger(l)||!Number.isSafeInteger(g)||g<l)throw Error("Recipient balance evidence is unavailable or unsafe");f=String(g-l)}else{if(!A.asset||tr(A.asset)!==tr(u.asset)||A.amountAtomic!==u.amountAtomic)throw Error("Payment token identity or atomic amount differs from the request");let R=E.staticAccounts.indexOf(O(A.destinationTokenAccount));if(!Array.isArray(r.preTokenBalances)||!Array.isArray(r.postTokenBalances))throw Error("Token balance evidence is unavailable");let l=r.preTokenBalances.filter(v=>v.accountIndex===R),g=r.postTokenBalances.filter(v=>v.accountIndex===R);if(l.length>1||g.length!==1||l.length===0&&!A.createRecipientAccount)throw Error("Recipient token balance evidence is ambiguous");let Z=v=>{if(v.mint!==u.asset.mint||v.owner!==u.recipient||v.programId!==$||v.uiTokenAmount?.decimals!==u.asset.decimals)throw Error("Recipient token balance identity differs from the request");return BigInt(ue(v.uiTokenAmount.amount))};f=String(Z(g[0])-(l.length?Z(l[0]):0n))}if(f!==u.amountAtomic)throw Error("Recipient did not receive the exact requested amount");let h={protocol:"capp.solana-payment-verification.v1",requestId:u.requestId,requestDigest:u.requestDigest,network:u.network,genesisHash:s,signature:t,slot:o,blockTime:a,commitment:c,confirmationStatus:i,recipient:u.recipient,sender:A.sender,asset:u.asset,amountAtomic:u.amountAtomic,receivedAtomic:f,reference:u.reference,transactionDigest:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",U(n[0]))),R=>R.toString(16).padStart(2,"0")).join(""),paid:!0,simulated:!1,source:"rpc-observation",authorises:!1,fulfilmentRecorded:!1};return{...h,evidenceDigest:await Aa(h)}}async function _A(e,t,n){nr(e);let r=Ve().decode(U(e));if(!Rt(r.messageBytes,U(t))||Object.keys(r.signatures).length!==1||!r.signatures[n])throw Error("Signed transaction differs from the reviewed message or wallet");let o=await crypto.subtle.importKey("raw",z().encode(O(n)),{name:"Ed25519"},!1,["verify"]);if(!await crypto.subtle.verify("Ed25519",o,r.signatures[n],r.messageBytes))throw Error("Invalid transaction signature");return String(At(r))}return Oa(AA);})();
  // END GENERATED SOLANA WIRE
  const ID = "uk.capp.sidecar.solana-latch";
  if (window.__CAPP_SOLANA_LATCH_INSTALLED__) return;
  const plan = window.__CAPP_EXECUTABLE_PLAN__ || {};
  const selected = (
    Array.isArray(plan.library?.selected) ? plan.library.selected : []
  ).find((x) => x?.id === ID);
  if (!selected) return;
  const config = {
    ...{
      providerMode: "demo-confirm",
      network: "devnet",
      externalAdapterUrl: "",
    },
    ...(selected.config || {}),
  };
  const rt = makeRuntime({
    component: "latch",
    plan,
    config,
    modes: ["demo-confirm", "native-mwa", "external-adapter", "devnet-test-wallet", "device-wallet"],
    storeKey: "",
    storeProtocol: "",
    collections: {},
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

  // BEGIN GENERATED WALLET MANAGER
  var WalletStandardBundle = {getWallets: () => ({get: () => []})};
  if (typeof Event !== "undefined" && typeof window.addEventListener === "function") {
var WalletStandardBundle=(()=>{var c=Object.defineProperty;var h=Object.getOwnPropertyDescriptor;var g=Object.getOwnPropertyNames;var y=Object.prototype.hasOwnProperty;var b=(e,t)=>{for(var r in t)c(e,r,{get:t[r],enumerable:!0})},E=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of g(t))!y.call(e,a)&&a!==r&&c(e,a,{get:()=>t[a],enumerable:!(n=h(t,a))||n.enumerable});return e};var v=e=>E(c({},"__esModule",{value:!0}),e);var x={};b(x,{getWallets:()=>p});var m=function(e,t,r,n){if(r==="a"&&!n)throw new TypeError("Private accessor was defined without a getter");if(typeof t=="function"?e!==t||!n:!t.has(e))throw new TypeError("Cannot read private member from an object whose class did not declare it");return r==="m"?n:r==="a"?n.call(e):n?n.value:t.get(e)},P=function(e,t,r,n,a){if(n==="m")throw new TypeError("Private method is not writable");if(n==="a"&&!a)throw new TypeError("Private accessor was defined without a setter");if(typeof t=="function"?e!==t||!a:!t.has(e))throw new TypeError("Cannot write private member to an object whose class did not declare it");return n==="a"?a.call(e,r):a?a.value=r:t.set(e,r),r},l,i,d=new Set;function _(e){s=void 0,d.add(e)}function W(e){s=void 0,d.delete(e)}var o={};function p(){if(i||(i=Object.freeze({register:u,get:j,on:T}),typeof window>"u"))return i;let e=Object.freeze({register:u});try{window.addEventListener("wallet-standard:register-wallet",({detail:t})=>t(e))}catch(t){console.error(`wallet-standard:register-wallet event listener could not be added
`,t)}try{window.dispatchEvent(new f(e))}catch(t){console.error(`wallet-standard:app-ready event could not be dispatched
`,t)}return i}function u(...e){return e=e.filter(t=>!d.has(t)),e.length?(e.forEach(t=>_(t)),o.register?.forEach(t=>w(()=>t(...e))),function(){e.forEach(r=>W(r)),o.unregister?.forEach(r=>w(()=>r(...e)))}):()=>{}}var s;function j(){return s||(s=[...d]),s}function T(e,t){return o[e]?.push(t)||(o[e]=[t]),function(){o[e]=o[e]?.filter(n=>t!==n)}}function w(e){try{e()}catch(t){console.error(t)}}var f=class extends Event{get detail(){return m(this,l,"f")}get type(){return"wallet-standard:app-ready"}constructor(t){super("wallet-standard:app-ready",{bubbles:!1,cancelable:!1,composed:!1}),l.set(this,void 0),P(this,l,t,"f")}preventDefault(){throw new Error("preventDefault cannot be called")}stopImmediatePropagation(){throw new Error("stopImmediatePropagation cannot be called")}stopPropagation(){throw new Error("stopPropagation cannot be called")}};l=new WeakMap;return v(x);})();
  }
  // Latch owns keys. Applications receive public metadata; backup actions are
  // explicit and must never pass through application activity/agent logging.
  const VAULT_PROTOCOL='capp.solana-wallets.v1';
  const walletScope=JSON.stringify([plan.projectId||plan.project?.id||plan.appId||'app',plan.componentId||'main',plan.appId||plan.app?.id||'app']);
  const walletStoreKey=VAULT_PROTOCOL+':'+encodeURIComponent(walletScope);
  const walletNetworks=['devnet','mainnet-beta'];
  const MAINNET_WARNING='EXPERIMENTAL MAINNET WALLET — REAL MONEY\n\nWallet security is not the primary focus of this alpha. Bugs, malicious scripts, device compromise, lost passwords or cleared app data can permanently lose ALL funds. Password encryption is not a hardware wallet or an audited security guarantee. Keep an independent backup. Use only funds you can afford to lose.';
  const unlockedWallets=new Map(),externalWallets=new Map();
  let walletLockTimer=null;
  const walletLabel=value=>{const label=String(value||'My wallet').trim();if(!label||label.length>64||/[\x00-\x1f]/.test(label))fail('LABEL','Use a wallet name of 1–64 characters');return label;};
  const walletNetwork=value=>{if(!walletNetworks.includes(value))fail('NETWORK','Choose devnet or mainnet-beta');return value;};
  const mainnetConsent=input=>{
    if(input.network!=='mainnet-beta')return;
    if(config.allowMainnetWallets!==true)fail('MAINNET_DISABLED','Enable experimental mainnet wallet management in Latch configuration');
    if(input.acknowledgeMainnetLoss!==true)fail('MAINNET_WARNING','Read and accept the mainnet loss warning first');
    if(!window.confirm(MAINNET_WARNING+'\n\nContinue with mainnet wallet management?'))fail('DECLINED','Mainnet action cancelled');
  };
  const requireDeviceWallet=()=>{if(rt.mode()!=='device-wallet')fail('PROVIDER','Choose Device wallet manager in Latch configuration, then recompile and rebuild this app');};
  const emptyWalletStore=()=>({protocol:VAULT_PROTOCOL,scope:walletScope,wallets:[],selected:{devnet:null,'mainnet-beta':null}});
  const validateWallet=row=>{
    if(!row||typeof row!=='object'||!/^wallet_[a-f0-9-]{36}$/.test(row.id)||!walletNetworks.includes(row.network))throw Error();
    SolanaWire.publicKey(row.walletPubkey);walletLabel(row.label);
    if(row.network==='mainnet-beta'){
      if(row.secret!==undefined||row.protection!=='password-aes-gcm'||row.encrypted?.iterations!==600000||row.encrypted?.algorithm!=='PBKDF2-SHA256/AES-256-GCM')throw Error();
      for(const [key,length] of [['salt',16],['iv',12],['ciphertext',80]])if(SolanaWire.unb64(row.encrypted[key]).length!==length)throw Error();
    }else if(row.protection!=='device-plaintext'||SolanaWire.unb64(row.secret).length!==64)throw Error();
    return row;
  };
  const readWalletRaw=()=>{
    try{return localStorage.getItem(walletStoreKey);}
    catch{fail('WALLET_STORAGE_UNAVAILABLE','Device storage cannot be read. Restore access to storage and retry; existing wallets have not been replaced.');}
  };
  const parseWalletStore=raw=>{
      if(raw===null)return emptyWalletStore();
      if(raw.length>150000)throw Error();
      const store=JSON.parse(raw);
      if(store.protocol!==VAULT_PROTOCOL||store.scope!==walletScope||!Array.isArray(store.wallets)||store.wallets.length>32||!store.selected)throw Error();
      store.wallets.forEach(validateWallet);
      if(new Set(store.wallets.map(w=>w.id)).size!==store.wallets.length||new Set(store.wallets.map(w=>w.walletPubkey)).size!==store.wallets.length)throw Error();
      for(const network of walletNetworks)if(store.selected[network]!==null&&!store.wallets.some(w=>w.id===store.selected[network]&&w.network===network))throw Error();
      return store;
  };
  const loadWalletStore=()=>{
    const raw=readWalletRaw();
    try{return parseWalletStore(raw);}
    catch {fail('WALLET_STORAGE','Wallet storage is damaged. Existing data was preserved; do not clear app data. Use explicit recovery with an independent wallet backup.');}
  };
  const saveWalletStore=store=>{
    if(store.wallets.length>32)fail('LIMIT','This app can retain 32 wallets. Back up an unused wallet before removing it.');
    try {localStorage.setItem(walletStoreKey,JSON.stringify(store));}
    catch {fail('WALLET_STORAGE','The wallet could not be saved. Free device storage and retry; no new wallet was selected.');}
  };
  const withWalletLock=fn=>typeof navigator!=='undefined'&&navigator.locks?.request?navigator.locks.request(walletStoreKey,fn):fn();
  const walletGuard=fn=>rt.guard(input=>{
    requireDeviceWallet();
    return withWalletLock(()=>fn(input||{}));
  });
  const walletRow=(store,input)=>{
    const row=store.wallets.find(w=>w.id===input.walletId);
    if(!row)fail('WALLET','Choose a saved wallet');
    return row;
  };
  const lockWallets=()=>{unlockedWallets.clear();clearTimeout(walletLockTimer);walletLockTimer=null;};
  const rememberUnlocked=(row,wallet)=>{
    if(typeof document!=='undefined'&&document.hidden)return;
    unlockedWallets.set(row.id,{wallet,fingerprint:JSON.stringify(row.encrypted),expires:Date.now()+300000});
    clearTimeout(walletLockTimer);walletLockTimer=setTimeout(lockWallets,300000);walletLockTimer?.unref?.();
  };
  const unlockedFor=row=>{
    const entry=unlockedWallets.get(row.id);
    if(!entry||entry.expires<=Date.now()||entry.fingerprint!==JSON.stringify(row.encrypted)){unlockedWallets.delete(row.id);return null;}
    return entry.wallet;
  };
  const publicWallet=(row,store)=>({walletId:row.id,label:row.label,network:row.network,walletPubkey:row.walletPubkey,provider:'device-wallet',
    protection:row.protection,backedUpAt:row.backedUpAt||null,selected:store.selected[row.network]===row.id,
    locked:row.network==='mainnet-beta'&&!unlockedFor(row),createdAt:row.createdAt});
  const passwordKey=async(password,salt,usage)=>{
    if(typeof password!=='string'||password.length<12||password.length>1024)fail('PASSWORD','Use a password of 12–1024 characters. Keep it with your recovery plan.');
    const bytes=new TextEncoder().encode(password);
    try {
      const material=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
      return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,[usage]);
    }finally{bytes.fill(0);}
  };
  const walletAAD=row=>new TextEncoder().encode(JSON.stringify([VAULT_PROTOCOL,row.network,row.walletPubkey]));
  const encryptWallet=async(row,bytes,password)=>{
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await passwordKey(password,salt,'encrypt');
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:walletAAD(row)},key,bytes));
    return {algorithm:'PBKDF2-SHA256/AES-256-GCM',iterations:600000,salt:SolanaWire.b64(salt),iv:SolanaWire.b64(iv),ciphertext:SolanaWire.b64(ciphertext)};
  };
  const decryptWallet=async(row,password)=>{
    let bytes;
    try {
      const key=await passwordKey(password,SolanaWire.unb64(row.encrypted.salt),'decrypt');
      bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:SolanaWire.unb64(row.encrypted.iv),additionalData:walletAAD(row)},key,SolanaWire.unb64(row.encrypted.ciphertext)));
      const wallet=await SolanaWire.importWallet(bytes);
      if(wallet.address!==row.walletPubkey)throw Error();
      return {wallet,bytes};
    }catch {bytes?.fill(0);fail('UNLOCK','Incorrect password or damaged wallet backup. Saved data was preserved.');}
  };
  const activeDeviceWallet=network=>{
    const store=loadWalletStore(),external=externalWallets.get(network);
    if(external){
      const account=external.provider.accounts?.find(a=>a.address===external.address&&a.chains?.includes('solana:'+network)&&a.features?.includes('solana:signTransaction'));
      if(account)return {provider:'wallet-standard',providerName:external.provider.name,network,connected:true,walletPubkey:account.address,temporary:false,external:true};
      externalWallets.delete(network);
    }
    const row=store.wallets.find(w=>w.id===store.selected[network]);
    return row?{...publicWallet(row,store),connected:row.network==='devnet'||!!unlockedFor(row),temporary:false,external:false}:
      {provider:'device-wallet',network,connected:false,walletPubkey:null,temporary:false};
  };
  const standardProviders=()=>WalletStandardBundle.getWallets().get().filter(w=>typeof w.features?.['standard:connect']?.connect==='function'&&typeof w.features?.['solana:signTransaction']?.signTransaction==='function');
  const providerIds=new WeakMap();let nextProviderId=0;
  const providerId=provider=>{if(!providerIds.has(provider))providerIds.set(provider,'external_'+(++nextProviderId));return providerIds.get(provider);};
  const walletList=walletGuard(async()=>{
    const store=loadWalletStore();
    return {protocol:VAULT_PROTOCOL,wallets:store.wallets.map(row=>publicWallet(row,store)),active:Object.fromEntries(walletNetworks.map(network=>[network,activeDeviceWallet(network)])),
      externalProviders:standardProviders().map(w=>({id:providerId(w),name:String(w.name).slice(0,80),networks:walletNetworks.filter(n=>w.chains?.includes('solana:'+n))})),
      mainnetEnabled:config.allowMainnetWallets===true,mainnetTransactionsEnabled:false};
  });
  const newWalletRow=async(input,bytes,wallet)=>{
    const row={id:'wallet_'+crypto.randomUUID(),label:walletLabel(input.label),network:walletNetwork(input.network),walletPubkey:wallet.address,createdAt:Date.now(),protection:input.network==='mainnet-beta'?'password-aes-gcm':'device-plaintext'};
    if(row.network==='mainnet-beta')row.encrypted=await encryptWallet(row,bytes,input.password);else row.secret=SolanaWire.b64(bytes);
    return row;
  };
  const putNewWallet=async(input,bytes,wallet)=>{
    const store=loadWalletStore();
    if(store.wallets.some(w=>w.walletPubkey===wallet.address))fail('DUPLICATE','This key is already saved. Use its existing wallet; keep devnet and mainnet keys separate.');
    const row=await newWalletRow(input,bytes,wallet);
    // Detect competing contexts when Web Locks are unavailable, before overwriting.
    if(JSON.stringify(store)!==JSON.stringify(loadWalletStore()))fail('WALLET_CONFLICT','Wallets changed in another window. Retry this action.');
    store.wallets.push(row);
    if(input.select!==false)store.selected[row.network]=row.id;
    saveWalletStore(store);
    if(input.select!==false)externalWallets.delete(row.network);
    if(row.network==='mainnet-beta')rememberUnlocked(row,wallet);
    return publicWallet(row,store);
  };
  const createDeviceWallet=async(input)=>{
    walletNetwork(input.network);mainnetConsent(input);
    let bytes;
    try {const generated=await SolanaWire.createExportableWallet();bytes=await SolanaWire.walletSecret(generated);const wallet=await SolanaWire.importWallet(bytes);return await putNewWallet(input,bytes,wallet);}
    finally {bytes?.fill(0);}
  };
  const walletCreate=walletGuard(createDeviceWallet);
  const importWalletInput=async(input,accept)=>{
    walletNetwork(input.network);mainnetConsent(input);
    let bytes;
    try {
      if(input.backup){
        const backup=typeof input.backup==='string'?JSON.parse(input.backup):input.backup;
        if(backup.protocol!=='capp.solana-wallet-backup.v1')fail('BACKUP','Choose a Solana Lab wallet backup');
        let row;try{row=validateWallet(backup.wallet);}catch{fail('BACKUP','Wallet backup is damaged or unsupported');}
        if(row.network!==input.network)fail('NETWORK','The backup network must match the selected tab');
        if(row.network==='mainnet-beta')bytes=(await decryptWallet(row,input.password)).bytes;else bytes=SolanaWire.unb64(row.secret);
      }else {
        const text=String(input.privateKey||'').trim();
        // Validate original values before any Uint8Array coercion.
        await SolanaWire.importWallet(text);
        bytes=text.startsWith('[')?Uint8Array.from(JSON.parse(text)):SolanaWire.privateKeyBytes(text);
      }
      const wallet=await SolanaWire.importWallet(bytes);
      if(input.backup){const b=typeof input.backup==='string'?JSON.parse(input.backup):input.backup;if(wallet.address!==b.wallet.walletPubkey)fail('BACKUP','Backup address does not match its key');}
      return await accept(input,bytes,wallet);
    }catch(error){
      if(String(error?.code||'').startsWith('CAPP_'))throw error;
      fail('IMPORT','Use a valid wallet backup, 64-byte Solana keypair JSON array or base58 private key. Recovery phrases are not supported.');
    }finally {bytes?.fill(0);}
  };
  const walletImport=walletGuard(input=>importWalletInput(input,putNewWallet));
  const damagedWalletRaw=()=>{
    const raw=readWalletRaw();let healthy=false;
    try{parseWalletStore(raw);healthy=true;}catch{}
    if(healthy)fail('RECOVERY_NOT_NEEDED','The wallet store is readable. Use ordinary import to add a backup without replacing saved wallets.');
    if(raw.length>1500000)fail('RECOVERY_LIMIT','The damaged store is too large for in-app recovery. Its original bytes were preserved.');
    return raw;
  };
  const walletRecoveryStatus=walletGuard(async()=>{
    const raw=readWalletRaw();
    try{parseWalletStore(raw);return {status:'healthy',canRecover:false};}catch{}
    return {status:'damaged',canRecover:raw.length<=1500000,storeDigest:await rt.shaBytes(new TextEncoder().encode(raw)),
      mainnetEnabled:config.allowMainnetWallets===true};
  });
  const walletRecover=walletGuard(async input=>{
    const raw=damagedWalletRaw(),storeDigest=await rt.shaBytes(new TextEncoder().encode(raw));
    if(input.storeDigest!==storeDigest)fail('WALLET_CONFLICT','The damaged store changed. Refresh recovery before continuing.');
    if(!input.backup||input.acknowledgeRecovery!==true)fail('RECOVERY_CONFIRMATION','Choose an independent wallet backup and acknowledge that other wallets require their own backups.');
    return importWalletInput(input,async(value,bytes,wallet)=>{
      if(value.confirmAddress!==wallet.address)fail('RECOVERY_CONFIRMATION','Enter the full address of the wallet being restored.');
      const row=await newWalletRow(value,bytes,wallet),store=emptyWalletStore();
      store.wallets.push(row);store.selected[row.network]=row.id;
      if(!window.confirm('Recover this wallet from your backup?\n\n'+wallet.address+'\n\nThe damaged wallet store will be retained separately on this device before replacement. Only this wallet will be restored. Other wallets need their own backups. Saved payments and signing attempts stay intact. Do not clear app data.'))fail('DECLINED','Wallet recovery cancelled');
      if(readWalletRaw()!==raw)fail('WALLET_CONFLICT','Wallet storage changed during recovery. Refresh and retry.');
      // Content-addressed quarantine makes an interrupted/repeated recovery
      // idempotent. Never replace the active store before verifying this copy.
      const retainedKey=walletStoreKey+':damaged:'+storeDigest;
      try{
        const retained=localStorage.getItem(retainedKey);
        if(retained!==null&&retained!==raw)throw Error();
        if(retained===null)localStorage.setItem(retainedKey,raw);
        if(localStorage.getItem(retainedKey)!==raw)throw Error();
      }catch{fail('RECOVERY_STORAGE','Could not preserve the damaged store. Recovery stopped; existing wallets were not replaced. Free device storage and retry.');}
      if(readWalletRaw()!==raw)fail('WALLET_CONFLICT','Wallet storage changed during recovery. The retained copy was kept; refresh and retry.');
      saveWalletStore(store);lockWallets();externalWallets.clear();
      return {...publicWallet(row,store),recovered:true,damagedStorePreserved:true};
    });
  });
  const walletSelect=walletGuard(async input=>{
    const store=loadWalletStore(),row=walletRow(store,input);store.selected[row.network]=row.id;saveWalletStore(store);externalWallets.delete(row.network);return publicWallet(row,store);
  });
  const walletRename=walletGuard(async input=>{const store=loadWalletStore(),row=walletRow(store,input);row.label=walletLabel(input.label);saveWalletStore(store);return publicWallet(row,store);});
  const walletRemove=walletGuard(async input=>{
    const store=loadWalletStore(),row=walletRow(store,input);
    if(input.confirmAddress!==row.walletPubkey||!window.confirm('Remove '+row.label+' from this device?\n\nWithout an independent backup, funds at '+row.walletPubkey+' may be permanently inaccessible. This does not delete blockchain activity.'))fail('DECLINED','Wallet removal cancelled');
    store.wallets=store.wallets.filter(w=>w.id!==row.id);if(store.selected[row.network]===row.id)store.selected[row.network]=null;
    saveWalletStore(store);unlockedWallets.delete(row.id);return {removed:true,walletId:row.id};
  });
  const walletUnlock=walletGuard(async input=>{
    const store=loadWalletStore(),row=walletRow(store,input);if(row.network!=='mainnet-beta')return publicWallet(row,store);
    const {wallet,bytes}=await decryptWallet(row,input.password);bytes.fill(0);rememberUnlocked(row,wallet);return publicWallet(row,store);
  });
  const walletLock=walletGuard(async()=>{lockWallets();return {locked:true};});
  const walletExport=walletGuard(async input=>{
    const store=loadWalletStore(),row=walletRow(store,input);
    if(input.format==='keypair'){
      mainnetConsent({...input,network:row.network});
      if(!window.confirm('Export an UNENCRYPTED private key for '+row.label+'?\n\nAnyone with this file can spend all funds at this address. Store it privately and remove unsafe copies.'))fail('DECLINED','Key export cancelled');
      let bytes;
      try {bytes=row.network==='mainnet-beta'?(await decryptWallet(row,input.password)).bytes:SolanaWire.unb64(row.secret);return {format:'solana-keypair',keypair:Array.from(bytes)};}
      finally{bytes?.fill(0);}
    }
    if(input.format&&input.format!=='backup')fail('FORMAT','Choose backup or keypair');
    if(!window.confirm('Download a wallet backup for '+row.label+'?\n\n'+(row.network==='mainnet-beta'?'This file is password encrypted. Losing its password loses access.':'DEVNET ONLY: this backup contains an unencrypted test private key.')))fail('DECLINED','Backup cancelled');
    // Download requested is not proof the user retained a backup.
    return {protocol:'capp.solana-wallet-backup.v1',wallet:clone(row),exportedAt:Date.now()};
  });
  const walletConnectExternal=walletGuard(async input=>{
    const network=walletNetwork(input.network);mainnetConsent(input);
    const provider=standardProviders().find(w=>providerId(w)===input.providerId);
    if(!provider||!provider.chains?.includes('solana:'+network))fail('PROVIDER','This wallet does not advertise the selected network. Enable that network in your wallet and refresh.');
    await provider.features['standard:connect'].connect();
    const accounts=provider.accounts.filter(a=>a.chains?.includes('solana:'+network)&&a.features?.includes('solana:signTransaction'));
    const account=input.walletPubkey?accounts.find(a=>a.address===input.walletPubkey):accounts.length===1?accounts[0]:null;
    if(!account)return {chooseAccount:true,providerId:input.providerId,accounts:accounts.map(a=>({walletPubkey:a.address,label:String(a.label||a.address).slice(0,80)}))};
    SolanaWire.publicKey(account.address);
    if(SolanaWire.b64(account.publicKey)!==SolanaWire.b64(SolanaWire.addressBytes(account.address)))fail('WALLET','Provider account address and public key differ');
    externalWallets.set(network,{provider,address:account.address});return activeDeviceWallet(network);
  });
  const walletDisconnectExternal=walletGuard(async input=>{
    const network=walletNetwork(input.network),current=externalWallets.get(network);
    externalWallets.delete(network);
    // Drop every local session for this provider before asking it to disconnect.
    if(current){for(const [n,w] of externalWallets)if(w.provider===current.provider)externalWallets.delete(n);await current.provider.features['standard:disconnect']?.disconnect();}
    return {disconnected:true};
  });
  const deviceAuthorise=async normal=>{
    // The manager can hold mainnet wallets, while this signing recipe remains devnet.
    if(normal.network!=='devnet'||config.network!=='devnet')fail('NETWORK','Device-wallet payment signing currently requires devnet');
    const active=activeDeviceWallet('devnet');
    if(!active.connected||active.walletPubkey!==normal.walletPubkey)fail('WALLET','Select the same devnet wallet used to prepare this transfer');
    const facts=await SolanaWire.inspectTransfer(normal.messageBytesBase64);
    if(facts.sender!==active.walletPubkey||facts.amountLamports>rt.number(config.testMaxLamports??1000000000,'Transfer ceiling',1,1000000000))fail('LIMIT','Transfer exceeds the wallet policy');
    if(facts.asset)SolanaWire.tokenLimit(config.tokenLimits??'[]',facts.asset.mint,facts.amountAtomic);
    const attemptsKey=walletStoreKey+':attempts';let attempts;
    try{const raw=localStorage.getItem(attemptsKey);if(raw&&raw.length>1500000)throw Error();attempts=raw?JSON.parse(raw):{};if(!rt.object(attempts)||Object.keys(attempts).length>256)throw Error();}
    catch{fail('WALLET_STORAGE','Saved signing attempts could not be read. Existing data was preserved.');}
    const binding=await digest(normal),previous=attempts[normal.attemptId];
    if(previous){
      if(previous.binding!==binding)fail('ATTEMPT_CONFLICT','This attempt is already bound to another request');
      if(previous.result){await SolanaWire.verify(previous.result.signedTransactionBase64,normal.messageBytesBase64,normal.walletPubkey);return clone(previous.result);}
    }else if(Object.keys(attempts).length>=256)fail('LIMIT','The wallet has reached 256 recorded signing attempts. Preserve its recovery records.');
    const saveAttempts=()=>{try{localStorage.setItem(attemptsKey,JSON.stringify(attempts));}catch{fail('WALLET_STORAGE','Could not retain the signing attempt. Preserve this operation before continuing.');}};
    attempts[normal.attemptId]={binding,result:null};saveAttempts();
    const conduit=await rt.peer('conduit','devnet');await conduit.verifyNetwork();
    const valid=await conduit.request({method:'isBlockhashValid',params:[facts.blockhash,{commitment:'confirmed'}],network:'devnet'});
    if(valid?.value!==true)fail('EXPIRED','The reviewed transaction expired. Prepare a new request.');
    if(!window.confirm(`Sign this DEVNET transfer?\n\nFrom: ${facts.sender}\nTo: ${facts.recipient}\n${SolanaWire.transferSummary(facts)}\nMemo: ${facts.memo||'None'}\nOperation: ${normal.operationId}\n\nSigning does not submit the transaction.`))fail('DECLINED','Transfer declined');
    const draft=facts.asset?await SolanaWire.tokenTransfer({...facts,lastValidBlockHeight:1}):SolanaWire.transfer({...facts,lastValidBlockHeight:1});let signed;
    if(active.external){
      const session=externalWallets.get('devnet'),account=session?.provider.accounts.find(a=>a.address===normal.walletPubkey&&a.chains?.includes('solana:devnet'));
      if(!account)fail('WALLET','External wallet account changed. Reconnect the original account.');
      const outputs=await session.provider.features['solana:signTransaction'].signTransaction({transaction:SolanaWire.unb64(draft.transactionBase64),account,chain:'solana:devnet'});
      if(outputs?.length!==1||!outputs[0].signedTransaction)fail('SIGNATURE','Wallet did not return one signed transaction');
      const signedTransactionBase64=SolanaWire.b64(outputs[0].signedTransaction);
      signed={signedTransactionBase64,signature:await SolanaWire.verify(signedTransactionBase64,normal.messageBytesBase64,normal.walletPubkey)};
    }else {
      const store=loadWalletStore(),row=store.wallets.find(w=>w.id===store.selected.devnet);
      if(row?.walletPubkey!==normal.walletPubkey)fail('WALLET','Selected wallet changed before signing');
      const bytes=SolanaWire.unb64(row.secret);
      try{signed=await SolanaWire.sign(await SolanaWire.importWallet(bytes),draft.transactionBase64);}finally{bytes.fill(0);}
    }
    const result={protocol:'capp.solana-latch.authority.v2',provider:active.external?'wallet-standard':'device-wallet',authorised:true,
      operationId:normal.operationId,attemptId:normal.attemptId,network:'devnet',walletPubkey:normal.walletPubkey,messageDigest:normal.messageDigest,policyDigest:normal.policyDigest,...signed,submitted:false,createdAt:Date.now()/1000};
    attempts[normal.attemptId]={binding,result};saveAttempts();return result;
  };
  if(typeof window.addEventListener==='function'){
    window.addEventListener('pagehide',lockWallets);
    window.addEventListener('storage',event=>{if(event.key===walletStoreKey)lockWallets();});
  }
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.hidden)lockWallets();});
  // END GENERATED WALLET MANAGER
  const nativeProvider = () =>
    typeof window.cappSolanaLatchNative?.authorise === "function"
      ? window.cappSolanaLatchNative
      : null;
  let testWallet = null;
  const signedAttempts = new Map();
  const walletStatus = () => ({provider:'devnet-test-wallet',network:'devnet',connected:!!testWallet,
    walletPubkey:testWallet?.address || null,temporary:true,privateKeyExportable:false});
  const connect = rt.guard(async () => {
    if(rt.mode()==='device-wallet'){
      if(config.network!=='devnet')fail('NETWORK','Use the wallet manager to create a mainnet wallet explicitly');
      const current=activeDeviceWallet('devnet');
      if(current.walletPubkey)return current;
      if(!window.confirm('Create a saved devnet wallet on this device?\n\nIts test key is stored unencrypted in app data. Use devnet test SOL only, and back it up before clearing app data.'))fail('DECLINED','Wallet creation cancelled');
      await withWalletLock(async()=>{if(!activeDeviceWallet('devnet').walletPubkey)await createDeviceWallet({network:'devnet',label:'Devnet wallet'});});return activeDeviceWallet('devnet');
    }
    if(rt.mode() !== 'devnet-test-wallet' || config.network !== 'devnet') fail('PROVIDER','Choose the devnet test-wallet provider to create a temporary wallet');
    if(!testWallet){
      if(!window.confirm('Create a temporary devnet test wallet?\n\nIts key stays in memory and is lost when this app closes or reloads. Use test SOL only.'))fail('DECLINED','Wallet creation cancelled');
      try { testWallet = await SolanaWire.createWallet(); }
      catch { fail('CRYPTO_UNAVAILABLE','This webview does not support Ed25519. Update the webview or select an external wallet provider.'); }
    }
    return walletStatus();
  });
  const testAuthorise = async (normal) => {
    if(config.network!=='devnet' || normal.network!=='devnet')fail('NETWORK','The test wallet only signs devnet transfers');
    if(!testWallet || normal.walletPubkey!==testWallet.address)fail('WALLET','Connect the same test wallet used to prepare this transfer');
    const facts=await SolanaWire.inspectTransfer(normal.messageBytesBase64);
    if(facts.sender!==testWallet.address || facts.amountLamports>rt.number(config.testMaxLamports??1000000000,'Test-wallet transfer limit',1,1000000000))fail('LIMIT','Transfer exceeds the test wallet policy');
    if(facts.asset)SolanaWire.tokenLimit(config.tokenLimits??'[]',facts.asset.mint,facts.amountAtomic);
    const binding=await digest(normal),old=signedAttempts.get(normal.attemptId);
    if(old){if(old.binding!==binding)fail('ATTEMPT_CONFLICT','Attempt is already bound to another request');return clone(old.result);}
    if(signedAttempts.size>=64)fail('LIMIT','This wallet has reached its session signing limit');
    const conduit=await rt.peer('conduit','devnet');
    if(typeof conduit.verifyNetwork!=='function')fail('DEPENDENCY','Devnet test signing requires Conduit network verification');
    await conduit.verifyNetwork();
    const valid=await conduit.request({method:'isBlockhashValid',params:[facts.blockhash,{commitment:'confirmed'}],network:'devnet'});
    if(valid?.value!==true)fail('EXPIRED','The reviewed transaction blockhash is no longer valid. Prepare a new request.');
    if(!window.confirm(`Sign this devnet test transfer?\n\n${SolanaWire.transferSummary(facts)}\nTo: ${facts.recipient}\nMemo: ${facts.memo||'None'}\n\nOperation: ${normal.operationId}\nSigning does not submit the transaction.`))fail('DECLINED','Transfer declined');
    const draft=facts.asset?await SolanaWire.tokenTransfer({...facts,lastValidBlockHeight:1}):SolanaWire.transfer({...facts,lastValidBlockHeight:1});
    const signed=await SolanaWire.sign(testWallet,draft.transactionBase64);
    const result={protocol:'capp.solana-latch.authority.v2',provider:'devnet-test-wallet',authorised:true,
      operationId:normal.operationId,attemptId:normal.attemptId,network:'devnet',walletPubkey:testWallet.address,
      messageDigest:normal.messageDigest,policyDigest:normal.policyDigest,...signed,submitted:false,createdAt:Date.now()/1000};
    signedAttempts.set(normal.attemptId,{binding,result});return clone(result);
  };
  const authorise = rt.guard(async (input = {}) => {
    const mode = rt.mode(),
      messageDigest = hex(input.messageDigest, "Message digest"),
      operationId = id(input.operationId, "Operation ID");
    let exactMessageBytesPresent = false;
    if (input.messageBytesBase64) {
      if (
        (await shaBytes(rt.b64bytes(input.messageBytesBase64))) !==
        messageDigest
      )
        fail(
          "MESSAGE_MISMATCH",
          "Serialized message bytes do not match messageDigest",
        );
      exactMessageBytesPresent = true;
    }
    const demo = mode === "demo-confirm";
    const normal = {
      ...input,
      operationId,
      attemptId: id(input.attemptId, "Attempt ID", demo),
      policyDigest: hex(input.policyDigest, "Policy digest", demo),
      walletPubkey: String(input.walletPubkey || ""),
      messageDigest,
      exactMessageBytesPresent,
      network: demo ? "demo" : rt.network(input),
    };
    if (demo) {
      if (input.network && input.network !== "demo")
        fail("DEMO_ONLY", "Demo confirmation cannot authorise a live network");
      if (
        !window.confirm(
          `Approve this simulated request?\n\nOperation: ${operationId}\nMessage: ${messageDigest}\n\nNo wallet is contacted and no transaction is signed.`,
        )
      )
        fail("DECLINED", "Demo confirmation declined");
      return {
        protocol: "capp.solana-latch.authority.v2",
        provider: "demo-confirm",
        authorised: true,
        simulated: true,
        operationId,
        attemptId: normal.attemptId,
        network: "demo",
        walletPubkey: normal.walletPubkey || null,
        messageDigest,
        policyDigest: normal.policyDigest || null,
        exactMessageBytesPresent,
        privateKeyAccess: false,
        credentialsExposed: false,
        createdAt: Date.now() / 1000,
      };
    }
    if (
      !exactMessageBytesPresent ||
      normal.network === "demo" ||
      !normal.walletPubkey
    )
      fail(
        "BINDING",
        "Live authority requires message bytes, wallet identity, attempt and policy bindings on a live network",
      );
    if (mode === "native-mwa" && !nativeProvider())
      fail(
        "CAPP_SOLANA_MWA_UNAVAILABLE",
        "This build has no native Mobile Wallet Adapter provider",
      );
    const result =
      mode === 'device-wallet' ? await withWalletLock(()=>deviceAuthorise(normal)) : mode === 'devnet-test-wallet' ? await testAuthorise(normal) : mode === "external-adapter"
        ? await adapter("authorise", normal)
        : await nativeProvider().authorise(normal);
    rt.bound(result, normal, [
      "operationId",
      "attemptId",
      "network",
      "walletPubkey",
      "messageDigest",
      "policyDigest",
    ]);
    if (result.authorised !== true || result.simulated === true)
      fail("DECLINED", "Provider did not authorise this exact live request");
    // Return declared authority fields; provider-private response fields stay out of the app API.
    const allowed = [
      "protocol",
      "provider",
      "authorised",
      "operationId",
      "attemptId",
      "network",
      "walletPubkey",
      "messageDigest",
      "policyDigest",
      "signature",
      "signedTransactionBase64",
      "submitted",
      "createdAt",
    ];
    return {
      ...Object.fromEntries(
        allowed.filter((k) => rt.own(result, k)).map((k) => [k, result[k]]),
      ),
      simulated: false,
      exactMessageBytesPresent: true,
      privateKeyAccess: false,
      credentialsExposed: false,
    };
  });
  const statusFields = async () => ({
    // Public policy diagnostics only. This is not an approval or a readiness
    // promise; the exact message and current wallet are checked on authorise.
    signingPolicyStatus: true,
    signingPolicy: {
      protocol: 'capp.solana-signing-policy.v1',
      network: config.network,
      enforcedLocally: ['device-wallet','devnet-test-wallet'].includes(config.providerMode),
      maxLamports: ['device-wallet','devnet-test-wallet'].includes(config.providerMode) ? Number(config.testMaxLamports ?? 1000000000) : null,
      tokenLimits: ['device-wallet','devnet-test-wallet'].includes(config.providerMode) ? String(config.tokenLimits ?? '[]') : null,
      authorises: false,
    },
    ...(config.providerMode==='device-wallet'?{wallet:activeDeviceWallet(config.network),walletManager:true,walletCreateKeepsSelection:true,mainnetWalletManagement:config.allowMainnetWallets===true,mainnetSigning:false,signOnly:true,keyStorage:'device-app-storage',sessionManagement:'device-wallet-manager'}:{}),
    ...(config.providerMode === "native-mwa" && !nativeProvider()
      ? {
          ready: false,
          readiness: "needs-setup",
          error: {
            code: "CAPP_SOLANA_MWA_UNAVAILABLE",
            message: "Native MWA provider is not included in this build.",
          },
        }
      : {}),
    network: config.providerMode === "demo-confirm" ? "demo" : config.network,
    simulated: config.providerMode === "demo-confirm",
    privateKeyAccess: false,
    nativeMwaAvailable: !!nativeProvider(),
    sessionReuse: false,
    sessionManagement: config.providerMode==='device-wallet'?'device-wallet-manager':"provider-owned",
    exactMessageBinding: true,
    ...(config.providerMode==='devnet-test-wallet' ? {wallet:walletStatus(),sessionManagement:'temporary-in-memory',sessionReuse:true,...(config.network!=='devnet'?{ready:false,error:{code:'NETWORK',message:'The temporary test wallet only supports devnet.'}}:{})} : {}),
  });

  const status = async () => ({
    protocol: "capp.solana-component.status.v1",
    sidecarId: ID,
    component: "latch",
    providerMode: String(config.providerMode),
    network: config.network || null,
    ...rt.health(),
    ...(await statusFields()),
  });

  const api = Object.freeze({
    protocol: "capp.solana-latch.api.v2",
    status,
    authorise,
    connect,
    walletList,walletCreate,walletImport,walletSelect,walletRename,walletRemove,
    walletUnlock,walletLock,walletExport,walletConnectExternal,walletDisconnectExternal,
    walletRecoveryStatus,walletRecover,
  });
  window.capp = window.capp || {};
  window.capp.solana = window.capp.solana || {};
  window.capp.solana.latch = api;
  window.__CAPP_SOLANA_LATCH_INSTALLED__ = true;
  if (typeof document !== "undefined")
    document
      .querySelectorAll("[data-capp-solana-latch]")
      .forEach((el) =>
        rt.panel(
          el,
          "Solana Latch",
          "Request approval for one exact message. Demo confirmation is available locally; wallet signing belongs to an installed or external provider.",
          status,
        ),
      );
  const detail = {
    protocol: "capp.solana-component.runtime.v2",
    id: ID,
    component: "latch",
    api: "window.capp.solana.latch",
  };
  try {
    window.dispatchEvent(
      new CustomEvent("capp:solana-latch-ready", { detail }),
    );
    window.dispatchEvent(new CustomEvent("capp:sidecar-ready", { detail }));
  } catch (_) {}
})();
