// ⚠ VENDORED — DO NOT EDIT. The lead-acid shell shim, copied from ../auditable/ext/leadacid/index.js
// (itself vendored from gentropic/lead-acid, lead-acid.js). Re-vendor by copying that file here.

// ⚠ VENDORED — DO NOT EDIT. The lead-acid shell shim (SPEC §4.5).
// Source of truth: gentropic/lead-acid  →  lead-acid.js (../lead-acid/lead-acid.js).
// Re-vendor by copying that file here when the shell contract changes.
// Feature-detected: shell.present is false on desktop (native features simply
// absent), true inside the lead-acid Android shell. Exports { shell }.

export const shell = (() => {
  const present = typeof __leadacid !== 'undefined';

  // The body sidecar (SPEC §4.3): the shell hands the page one end of a
  // WebMessagePort as `__leadacid_port`. We post [id(12 ascii) | body] as an
  // ArrayBuffer, then fetch with the id in a header; the shell joins them into
  // req.body. THE PAGE PULLS THE PORT: this module asks for it
  // (GET /native/shell/port) once its listener is registered, so delivery can't
  // race module evaluation — a built bundle whose modules evaluate after the
  // page's load event (the registry/blob-URL build) would otherwise miss a port
  // pushed at onPageFinished, and every body call + stream would hang. The shell
  // creates a fresh channel per request; the latest one is the live one.
  let currentPort = null, resolvePort;
  const portReady = present ? new Promise((r) => { resolvePort = r; }) : Promise.resolve(null);
  // Push streams (SPEC §4.2): the shell posts {s:id, e:event, d:data} over the
  // SAME port (shell→page); no interceptor, no buffering, no padding. Routed by
  // stream id to per-stream handlers.
  const pushStreams = new Map();   // id → { handlers: Map<event,Set>, onclose }
  // A plugin may emit INSIDE the request that opens its stream (intake delivers
  // the queue at once), so the first messages can land before stream() has
  // learned the id. Hold them per unknown id and replay once it registers.
  const early = new Map();         // id → [message] (bounded)
  if (present) {
    window.addEventListener('message', (e) => {
      if (e.data === '__leadacid_port' && e.ports && e.ports[0]) {
        const port = e.ports[0];
        currentPort = port;
        port.onmessage = (ev) => {
          let m; try { m = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch { return; }
          if (!m || !m.s) return;
          const st = pushStreams.get(m.s);
          if (!st) {
            if (m.close) return;   // a close for a stream we've already dropped — nothing to hold
            const q = early.get(m.s) || []; if (q.length < 256) q.push(m); early.set(m.s, q);
            return;
          }
          dispatch(st, m);
        };
        resolvePort(port);
      }
    });
    // ask for the port now that the listener exists (fire-and-forget; a shell
    // that predates the route still pushes at onPageFinished and that path
    // lands here too)
    fetch('/native/shell/port').catch(() => {});
  }
  function dispatch(st, m) {
    if (m.close) { pushStreams.delete(m.s); st.onclose && st.onclose(); return; }
    const set = st.handlers.get(m.e); if (set) for (const cb of set) cb(m.d);
    const any = st.handlers.get('*'); if (any) for (const cb of any) cb(m.e, m.d);
  }
  let bodySeq = 0;
  function newBodyId() {
    // 12 ascii chars, unique per call
    const s = (Date.now().toString(36) + (bodySeq++).toString(36) + '00000000000').slice(0, 12);
    return s;
  }
  function sendBody(port, id, bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes
      : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
        : new TextEncoder().encode(typeof bytes === 'string' ? bytes : JSON.stringify(bytes));
    const buf = new Uint8Array(12 + u8.length);
    for (let i = 0; i < 12; i++) buf[i] = id.charCodeAt(i);
    buf.set(u8, 12);
    port.postMessage(buf.buffer, [buf.buffer]);
  }

  // request/reply. opts.body rides the port sidecar — hidden here so callers
  // pass {body} as if fetch carried it. Bodyless calls are plain fetch.
  async function native(path, opts) {
    if (opts && opts.body != null) {
      await portReady;
      if (currentPort) {
        const id = newBodyId();
        const { body, headers, ...rest } = opts;
        // Post the body FIRST so the shell has it (or is about to) when the
        // tagged fetch lands; the shell's awaitBody() tolerates either order.
        sendBody(currentPort, id, body);
        return fetch('/native/' + path, {
          ...rest,
          headers: { ...(headers || {}), 'X-LeadAcid-Body-Id': id },
        });
      }
    }
    return fetch('/native/' + path, opts);
  }

  // Open a push stream over the port (SPEC §4.2). Returns { on(event, cb),
  // onClose(cb), close() }. The shell pushes events with no buffering — unlike
  // SSE through the interceptor, which batches ~2 KiB (V-1), so no EventSource.
  async function stream(path, opts) {
    if (!present) throw new Error('no shell — streams are a native feature');
    await portReady;
    const sep = path.includes('?') ? '&' : '?';
    const res = await native(path + sep + 'transport=port', opts);
    if (!res.ok) throw new Error('stream open failed: ' + res.status);
    const id = (await res.json()).stream;
    const handlers = new Map();
    const st = { handlers, onclose: null };
    pushStreams.set(id, st);
    // replay what arrived before we knew the id — after the caller's .on()
    // calls, which follow the await synchronously (hence a macrotask)
    if (early.has(id)) { const q = early.get(id); early.delete(id); setTimeout(() => { for (const m of q) dispatch(st, m); }, 0); }
    const api = {
      on(event, cb) { let s = handlers.get(event); if (!s) handlers.set(event, s = new Set()); s.add(cb); return api; },
      onClose(cb) { st.onclose = cb; return api; },
      close() { if (pushStreams.delete(id)) native('shell/closestream?id=' + encodeURIComponent(id)); },
    };
    return api;
  }

  async function version() {
    if (!present) return null;
    try { return (await (await native('shell/info')).json()).version; }
    catch { return __leadacid.version(); }
  }

  const keepAwake = (on = true) =>
    native('shell/keepawake?on=' + (on ? 'true' : 'false'), { method: 'POST' });

  // Publish a finished output into a public collection (Downloads/Pictures/
  // Documents) — survives uninstall, visible to other apps. Body via §4.3 port.
  async function publish(name, bytes, { collection = 'Downloads', mime = 'application/octet-stream' } = {}) {
    const q = `?name=${encodeURIComponent(name)}&collection=${encodeURIComponent(collection)}&mime=${encodeURIComponent(mime)}`;
    const r = await native('fs/publish' + q, { method: 'POST', body: bytes });
    if (!r.ok) throw new Error('publish failed: ' + r.status);
    return r.json();   // { uri, name, bytes }
  }

  // Hand a file (or text) to the system share sheet. The chooser is the user's
  // confirmation — it's not a silent send.
  async function share(name, bytes, { mime = 'application/octet-stream', text, uri } = {}) {
    let q = `?name=${encodeURIComponent(name)}&mime=${encodeURIComponent(mime)}`;
    if (text) q += `&text=${encodeURIComponent(text)}`;
    if (uri) q += `&uri=${encodeURIComponent(uri)}`;          // a file already published — shared by reference, never re-sent
    return (await native('share' + q, { method: 'POST', body: bytes || undefined })).ok;
  }
  async function shareText(text) {
    return (await native('share?mime=text/plain&text=' + encodeURIComponent(text), { method: 'POST' })).ok;
  }

  // Hardware-backed signing (StrongBox/TEE). `sign` returns a raw P-256 sig that
  // verifies with WebCrypto ECDSA/P-256/SHA-256 directly.
  const attest = {
    async sign(bytes) {
      const r = await native('attest/sign', { method: 'POST', body: bytes });
      if (!r.ok) throw new Error('attest failed: ' + r.status);
      return r.json();   // { alg, sig, pub, hash, security }
    },
    async keyinfo() { return (await native('attest/keyinfo')).json(); },
  };

  // A Blob-SHAPED view of an fs token (size · slice · arrayBuffer · text ·
  // stream), so code that takes a File — micro's openBlob, a parser — reads the
  // shell's mmap'd file in ranges without knowing about the bridge. Slices are
  // lazy; reads go in 4 MiB requests. `name` rides along for dispatch-by-extension.
  const BLOB_CHUNK = 4 * 1024 * 1024;
  function fileBlob(token, size, name = token, start = 0, end = size) {
    const url = 'fs/' + encodeURIComponent(token);
    const read = async (a, b) => {
      const r = await native(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
      if (!r.ok && r.status !== 206) throw new Error('read failed: ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    };
    const n = end - start;
    return {
      name, size: n, type: '', lastModified: 0,
      slice(a = 0, b = n) {
        const s = Math.min(n, Math.max(0, a < 0 ? n + a : a)), e = Math.min(n, Math.max(s, b < 0 ? n + b : b));
        return fileBlob(token, size, name, start + s, start + e);
      },
      async arrayBuffer() {
        if (n <= 0) return new ArrayBuffer(0);
        const out = new Uint8Array(n); let at = 0;
        while (at < n) { const take = Math.min(BLOB_CHUNK, n - at); const bytes = await read(start + at, start + at + take); if (!bytes.length) throw new Error('short read'); out.set(bytes, at); at += bytes.length; }
        return out.buffer;
      },
      async text() { return new TextDecoder().decode(await this.arrayBuffer()); },
      stream() {
        let at = 0;
        return new ReadableStream({ async pull(ctrl) {
          if (at >= n) { ctrl.close(); return; }
          const take = Math.min(2 * 1024 * 1024, n - at); const bytes = await read(start + at, start + at + take);
          if (!bytes.length) { ctrl.close(); return; }
          at += bytes.length; ctrl.enqueue(bytes);
        } });
      },
    };
  }

  // Registered fs tokens (SAF picks + built-ins): [{token, size}]
  async function files() {
    try { return await (await native('fs/list')).json(); }
    catch { return []; }
  }

  // A duck-typed SOURCE over one fs token — the shape lamina's cursor and
  // micro's providers consume directly (readRange(off,len) → Uint8Array).
  function fileSource(token, size) {
    const url = 'fs/' + encodeURIComponent(token);
    return {
      token, size,
      rangeReadable: true,
      async readRange(offset, length) {
        const r = await native(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
        return new Uint8Array(await r.arrayBuffer());
      },
      async arrayBuffer() { return (await native(url)).arrayBuffer(); },
    };
  }

  // A @gcu/vfs Backend over /native/fs, path === token. Pass the artifact's own
  // Backend base class (lead-acid ships no vfs) — returns a subclass whose
  // readRange rides the mmap fast path and whose rangeReadable is true, so
  // @gcu/vfs consumers seek instead of full-reading. THE non-Sealed default.
  function fsBackend(Backend) {
    return class LeadAcidFsBackend extends Backend {
      async _size(token) {
        const list = await files();
        return (list.find(f => f.token === token) || {}).size ?? 0;
      }
      async stat(p) {
        const token = p.replace(/^\/+/, '');
        return { type: 'file', size: await this._size(token), _binary: true };
      }
      async readRange(p, offset, length) {
        return fileSource(p.replace(/^\/+/, '')).readRange(offset, length);
      }
      async readFile(p) {
        const token = p.replace(/^\/+/, '');
        return new Uint8Array(await (await native('fs/' + encodeURIComponent(token))).arrayBuffer());
      }
      get rangeReadable() { return true; }   // ← the fast-path flag consumers check
      get readonly() { return true; }         // fs plugin serves reads; writes = fs/publish
    };
  }


  // Fused orientation off the sensor plugin's rotation vector (SPEC §5.1) —
  // the survey-grade path, as opposed to deviceorientationabsolute which
  // WebView derives from the same sensor but hides the accuracy. Readings
  // arrive in the W3C deviceorientation convention so an artifact feeds them
  // to whatever already consumed the event (bearing's compass.*). `accuracy`
  // is Android's SensorManager.SENSOR_STATUS_*: 3 high · 2 medium · 1 low ·
  // 0 unreliable (figure-8 to recalibrate) · -1 no contact.
  async function orientation({ rateHz = 30, source = 'rotation' } = {}) {
    const s = await stream(`sensor/stream?types=${encodeURIComponent(source)}&rateHz=${rateHz}`);
    const readers = new Set(), accs = new Set();
    let accuracy = null;
    s.on(source, (d) => {
      const o = orientationFromRotationVector(d.v);
      if (!o) return;
      if (d.acc !== accuracy) { accuracy = d.acc; for (const cb of accs) cb(accuracy); }
      o.absolute = source !== 'game_rotation';
      o.accuracy = accuracy;
      o.t = d.t;
      for (const cb of readers) cb(o);
    });
    s.on('accuracy', (d) => { accuracy = d.acc; for (const cb of accs) cb(accuracy); });
    const api = {
      on(cb) { readers.add(cb); return api; },
      onAccuracy(cb) { accs.add(cb); return api; },
      onClose(cb) { s.onClose(cb); return api; },
      close() { s.close(); },
    };
    return api;
  }

  // Items shared TO the instrument (SPEC §5.1 intake, share's inbound twin).
  // A file arrives as an fs token with a ready `source` (readRange /
  // arrayBuffer) and a Blob-shaped `blob`; text as text. Whatever was queued
  // before the page asked — the share that launched the app — arrives first.
  //
  // SELF-REOPENING (found on device 2026-10-07): a share that reaches a RUNNING
  // singleTask instrument pauses it first (onPause → onNewIntent → onResume),
  // and onPause closes every push stream. The plugin keeps the item queued
  // until a stream is open — so unlike a sensor stream (which a page reopens
  // itself, by choice, for battery), intake reopens here, unconditionally: the
  // queue is durable and dropping it is the only way to lose a shared file.
  // Returns { on, close } — never a close notification: a close is our business.
  async function intake(onItem) {
    let closed = false, live = null;
    const extra = new Map();   // event → Set<cb>, re-attached on every reopen
    const wire = (s) => {
      live = s;
      s.on('item', (d) => {
        if (d.kind === 'file') { d.source = fileSource(d.token, d.size); d.blob = fileBlob(d.token, d.size, d.name); }
        onItem(d);
      });
      for (const [ev, cbs] of extra) for (const cb of cbs) s.on(ev, cb);
      s.onClose(() => {
        live = null;
        if (closed) return;
        setTimeout(() => { if (!closed) stream('intake/stream').then(wire).catch(() => {}); }, 0);
      });
    };
    wire(await stream('intake/stream'));
    const api = {
      on(event, cb) { let s = extra.get(event); if (!s) extra.set(event, s = new Set()); s.add(cb); if (live) live.on(event, cb); return api; },
      close() { closed = true; if (live) live.close(); live = null; },
    };
    return api;
  }

  // Raw GNSS off the platform LocationManager (SPEC §5.1 gnss). Each opens a
  // push stream; the first open asks for FINE location (the system dialog) and
  // rejects with {error:'permission', canRequest} if the user says no — or
  // canRequest:false when this instrument doesn't carry the gnss plugin.
  const gnss = {
    /** fixes: s.on('fix', {lat,lon,alt,acc,speed,bearing,t,provider,last}) */
    location: ({ minMs = 1000, provider } = {}) =>
      gnssOpen(`gnss/location?minMs=${minMs}${provider ? '&provider=' + encodeURIComponent(provider) : ''}`),
    /** s.on('status', {fixSats, satellites:[…]}) + 'firstfix' / 'engine' */
    status: () => gnssOpen('gnss/status'),
    /** s.on('raw', {clock, measurements}) — the PPK/PPP inputs, faithfully */
    raw: () => gnssOpen('gnss/raw'),
    /** s.on('nmea', {t, s}) */
    nmea: () => gnssOpen('gnss/nmea'),
    /** {granted, canRequest}; request:true shows the dialog if needed */
    async permission({ request = false } = {}) { return (await native('gnss/permission' + (request ? '?request=1' : ''))).json(); },
    /**
     * The logger: a foreground service captures with the screen off; the page
     * re-attaches via status() after a reload. stop() seals the file and
     * returns its fs token (+ `source`) for publish/share.
     */
    log: {
      async start({ what = ['raw', 'location'], name } = {}) {
        const q = `?what=${encodeURIComponent(what.join(','))}${name ? '&name=' + encodeURIComponent(name) : ''}`;
        const r = await native('gnss/log/start' + q, { method: 'POST' });
        const j = await r.json();
        if (!r.ok) { const e = new Error(j.detail || j.error || ('log start failed: ' + r.status)); e.status = r.status; e.info = j; throw e; }
        return j;
      },
      async stop() {
        const r = await native('gnss/log/stop', { method: 'POST' });
        const j = await r.json();
        if (!r.ok) { const e = new Error(j.detail || ('log stop failed: ' + r.status)); e.status = r.status; throw e; }
        if (j.token) j.source = fileSource(j.token, j.bytes);
        return j;
      },
      async status() {
        const j = await (await native('gnss/log/status')).json();
        if (j.token) j.source = fileSource(j.token, j.bytes);
        return j;
      },
    },
  };
  async function gnssOpen(path) {
    try { return await stream(path); }
    catch (e) {
      // a 403 carries {error:'permission', canRequest} — surface it as such
      const m = /stream open failed: (\d+)/.exec(String(e && e.message));
      if (m && m[1] === '403') {
        let info = null; try { info = await (await native(path.split('?')[0].replace(/\/[a-z]+$/, '/permission'))).json(); } catch { /* ignore */ }
        const err = new Error('location permission denied'); err.permission = info; throw err;
      }
      throw e;
    }
  }

  // Camera, level 1 (SPEC §5.1 camera): the plugin brings the CAMERA permission
  // and enumerates; preview/capture are plain getUserMedia in the page. Ask for
  // the permission here first and the viewfinder opens without a second prompt.
  const camera = {
    /** [{id, facing, hasRaw, focalLengthsMm, sensorMm, pixels}] — [] without the plugin */
    async list() { try { const r = await native('camera/list'); return r.ok ? r.json() : []; } catch { return []; } },
    /** {granted, canRequest}; request:true shows the dialog if needed */
    async permission({ request = false } = {}) {
      try { const r = await native('camera/permission' + (request ? '?request=1' : '')); return r.ok ? r.json() : { granted: false, canRequest: false }; }
      catch { return { granted: false, canRequest: false }; }
    },
  };


  // ── RemoteWritable: a real WritableStream over open / write… / close / abort routes ──
  // Shared by the tree writer (a part file in a picked folder) and publishStream (a
  // pending MediaStore row). `blob.stream().pipeTo(w)` works because it IS a
  // WritableStream; the File System Access conveniences write()/close()/abort()
  // work too (they take the stream's writer, so a later pipeTo sees it locked —
  // as with FileSystemWritableFileStream). Bytes accumulate to ≥4 MiB requests; a
  // Blob (or a ranged fileBlob) is streamed, never held whole. `.result` resolves
  // to whatever close returned ({ uri, name, bytes } for a publish).
  const WRITE_CHUNK = 4 * 1024 * 1024;
  const wErr = (name, msg) => new DOMException(msg, name);
  class RemoteWritable extends WritableStream {
    constructor(ops) {
      const box = {};
      super({
        write: (chunk) => box.self._sink(chunk),
        close: () => box.self._finish(),
        abort: () => box.self._drop(),
      });
      box.self = this;
      this._ops = ops; this._id = null; this._writer = null; this._acc = []; this._n = 0; this._done = false;
      this.result = new Promise((res, rej) => { this._res = res; this._rej = rej; });
      this.result.catch(() => {});   // observed through close()/pipeTo() rejections; never an unhandled rejection by itself
    }
    async _open() { if (this._id == null) this._id = await this._ops.open(); return this._id; }
    async _post(bytes) { const id = await this._open(); await this._ops.write(id, bytes); }
    async _flush() { if (!this._n) return; const out = new Uint8Array(this._n); let at = 0; for (const p of this._acc) { out.set(p, at); at += p.byteLength; } this._acc = []; this._n = 0; await this._post(out); }
    async _bytes(u8) { this._acc.push(u8); this._n += u8.byteLength; if (this._n >= WRITE_CHUNK) await this._flush(); }
    async _sink(data) {
      // WriteParams ({type:'write', data}) — a plain object; Blobs and our fileBlob have slice()
      if (data && typeof data === 'object' && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer) && typeof data.slice !== 'function' && 'type' in data) {
        if (data.type !== 'write') throw wErr('NotSupportedError', `${data.type} is not supported by this writer`);
        data = data.data;
      }
      if (typeof data === 'string') return this._bytes(new TextEncoder().encode(data));
      if (data instanceof ArrayBuffer) return this._bytes(new Uint8Array(data));
      if (ArrayBuffer.isView(data)) return this._bytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      if (data && typeof data.stream === 'function') {          // a Blob, or a ranged fileBlob — stream it
        const rd = data.stream().getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; await this._bytes(value); }
        return;
      }
      if (data && typeof data.arrayBuffer === 'function') return this._bytes(new Uint8Array(await data.arrayBuffer()));
      throw wErr('TypeError', 'unsupported write data');
    }
    async _finish() {
      if (this._done) return; this._done = true;
      try { await this._flush(); const id = await this._open(); const r = await this._ops.close(id); this._res(r); return r; }
      catch (e) { this._rej(e); throw e; }
    }
    async _drop() {
      if (this._done) return; this._done = true; this._acc = []; this._n = 0;
      if (this._id != null) await this._ops.abort(this._id).catch(() => {});
      this._rej(wErr('AbortError', 'aborted'));
    }
    _wr() { return this._writer || (this._writer = this.getWriter()); }
    write(data) { return this._wr().write(data); }
    seek() { return Promise.reject(wErr('NotSupportedError', 'seek — this writer is sequential')); }
    truncate() { return Promise.reject(wErr('NotSupportedError', 'truncate — this writer is sequential')); }
    close() { return this._writer ? this._writer.close() : super.close(); }
    abort(reason) { return this._writer ? this._writer.abort(reason) : super.abort(reason); }
  }

  // Streaming publish — a WritableStream into a public collection (Downloads /
  // Pictures / Documents). The MediaStore row is PENDING while bytes stream in
  // and appears in Files on close; abort drops it. `.result` → { uri, name,
  // bytes } — share by `uri` (shell.share(name, null, { uri })), never by
  // re-sending the bytes. A multi-GB export never sits in page memory.
  async function fsCall(path, opts) {
    const r = await native(path, opts);
    if (r.ok) return r.json();
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail || (path + ' → ' + r.status));
  }
  function publishStream(name, { collection = 'Downloads', mime = 'application/octet-stream' } = {}) {
    const q = `?name=${encodeURIComponent(name)}&collection=${encodeURIComponent(collection)}&mime=${encodeURIComponent(mime)}`;
    return new RemoteWritable({
      open: async () => (await fsCall('fs/publish/open' + q, { method: 'POST' })).w,
      write: (w, bytes) => fsCall('fs/publish/write?w=' + encodeURIComponent(w), { method: 'POST', body: bytes }),
      close: (w) => fsCall('fs/publish/close?w=' + encodeURIComponent(w), { method: 'POST' }),
      abort: (w) => fsCall('fs/publish/abort?w=' + encodeURIComponent(w), { method: 'POST' }),
    });
  }

  // ── tree: a folder the user picked, as File System Access-SHAPED handles ────
  // The `tree` plugin (ACTION_OPEN_DOCUMENT_TREE, grant persisted per folder)
  // serves a real folder on the phone; these classes give it the handle API an
  // artifact already speaks — getFileHandle / getDirectoryHandle / removeEntry /
  // entries / resolve / getFile / createWritable — so project-folder code runs
  // unchanged. Why not the WebView's own showDirectoryPicker: it is DEFINED there
  // and aborts instantly (no chooser), the worst kind of present.
  //
  // Handles persist: their own `__leadacidTree` field survives a structured clone
  // (IndexedDB), and `tree.rehydrate(obj)` turns the clone back into a live handle
  // (re-validating the folder grant; a lost grant throws NotFoundError, honestly).
  // Writes land in a `.name.part` beside the target and swap in on close.
  const tree = (() => {
    let probed = null;
    const err = (name, msg) => new DOMException(msg, name);
    const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const concat = (parts, n) => { const out = new Uint8Array(n); let at = 0; for (const p of parts) { out.set(p, at); at += p.byteLength; } return out; };
    async function call(path, params, opts) {
      const r = await native('tree/' + path + (params ? '?' + q(params) : ''), opts);
      if (r.ok) return r.json();
      const d = await r.json().catch(() => ({}));
      throw err(r.status === 404 ? 'NotFoundError' : r.status === 400 ? 'TypeMismatchError' : 'InvalidStateError', d.detail || (path + ' → ' + r.status));
    }
    // the tree writer: RemoteWritable over the tree routes (part file → renamed on close)
    const treeWritable = (t) => new RemoteWritable({
      open: async () => (await call('open', { dir: t.dir, path: t.path }, { method: 'POST' })).w,
      write: (w, bytes) => call('write', { w }, { method: 'POST', body: bytes }),
      close: (w) => call('close', { w }, { method: 'POST' }),
      abort: (w) => call('abort', { w }, { method: 'POST' }),
    });
    class TreeFileHandle {
      constructor(dir, path, name, uri) { this.kind = 'file'; this.name = name; this.__leadacidTree = { dir, path, uri, kind: 'file' }; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
      async isSameEntry(o) { const a = o && o.__leadacidTree, t = this.__leadacidTree; return !!(a && a.uri === t.uri && a.path === t.path); }
      async getFile() {
        const t = this.__leadacidTree;
        const i = await call('token', { dir: t.dir, path: t.path });
        const b = fileBlob(i.token, i.size, this.name); b.lastModified = i.mtime || 0;
        return b;
      }
      async createWritable() { return treeWritable(this.__leadacidTree); }
    }
    class TreeDirHandle {
      constructor(dir, path, name, uri) { this.kind = 'directory'; this.name = name; this.__leadacidTree = { dir, path, uri, kind: 'directory' }; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
      async isSameEntry(o) { const a = o && o.__leadacidTree, t = this.__leadacidTree; return !!(a && a.uri === t.uri && a.path === t.path); }
      _child(name) { if (!name || name.includes('/')) throw err('TypeError', 'a name, not a path'); const p = this.__leadacidTree.path; return p ? p + '/' + name : name; }
      async _stat(path) { try { return await call('stat', { dir: this.__leadacidTree.dir, path }); } catch (e) { if (e.name === 'NotFoundError') return null; throw e; } }
      async getFileHandle(name, { create = false } = {}) {
        const t = this.__leadacidTree, p = this._child(name);
        let s = await this._stat(p);
        if (!s) {
          if (!create) throw err('NotFoundError', name);
          await treeWritable({ dir: t.dir, path: p }).close();   // an empty file, like FSAA's create
          s = { kind: 'file' };
        }
        if (s.kind !== 'file') throw err('TypeMismatchError', name + ' is a directory');
        return new TreeFileHandle(t.dir, p, name, t.uri);
      }
      async getDirectoryHandle(name, { create = false } = {}) {
        const t = this.__leadacidTree, p = this._child(name);
        let s = await this._stat(p);
        if (!s) { if (!create) throw err('NotFoundError', name); await call('mkdir', { dir: t.dir, path: p }, { method: 'POST' }); s = { kind: 'directory' }; }
        if (s.kind !== 'directory') throw err('TypeMismatchError', name + ' is a file');
        return new TreeDirHandle(t.dir, p, name, t.uri);
      }
      async removeEntry(name, { recursive = false } = {}) {
        await call('remove', { dir: this.__leadacidTree.dir, path: this._child(name), recursive: recursive ? 1 : 0 }, { method: 'POST' });
      }
      async resolve(h) {
        const a = h && h.__leadacidTree, t = this.__leadacidTree;
        if (!a || a.uri !== t.uri) return null;
        if (a.path === t.path) return [];
        const pre = t.path ? t.path + '/' : '';
        return a.path.startsWith(pre) ? a.path.slice(pre.length).split('/') : null;
      }
      async *entries() {
        const t = this.__leadacidTree;
        for (const e of await call('list', { dir: t.dir, path: t.path })) {
          const p = this._child(e.name);
          yield [e.name, e.kind === 'directory' ? new TreeDirHandle(t.dir, p, e.name, t.uri) : new TreeFileHandle(t.dir, p, e.name, t.uri)];
        }
      }
      async *keys() { for await (const [k] of this.entries()) yield k; }
      async *values() { for await (const [, v] of this.entries()) yield v; }
      [Symbol.asyncIterator]() { return this.entries(); }
    }
    const leaf = (p) => p.split('/').pop();
    return {
      /** Does this instrument carry the tree plugin? (cached) */
      async probe() { if (probed == null) { try { probed = (await native('tree/info')).ok; } catch { probed = false; } } return probed; },
      /** The system folder picker → a directory handle, or null when the user backs out.
       *  `initial` = where it opens (a documents docId, e.g. 'primary:Download'); a hint, not a constraint. */
      async pick({ initial } = {}) { const r = await call('pick', initial ? { initial } : null, { method: 'POST' }); return r.cancelled ? null : new TreeDirHandle(r.dir, '', r.name, r.uri); },
      /** A folder picked before (its persisted grant) → a live handle; NotFoundError if the grant is gone. */
      async restore(uri) { const r = await call('restore', { uri }); return new TreeDirHandle(r.dir, '', r.name, r.uri); },
      /** A structured clone of a handle (out of IndexedDB) → a live handle. Non-tree values pass through. */
      async rehydrate(h) {
        if (!h || h instanceof TreeDirHandle || h instanceof TreeFileHandle) return h;
        const t = h.__leadacidTree; if (!t) return h;
        const r = await call('restore', { uri: t.uri });
        return t.kind === 'file' ? new TreeFileHandle(r.dir, t.path, h.name || leaf(t.path), t.uri)
          : new TreeDirHandle(r.dir, t.path, t.path ? (h.name || leaf(t.path)) : r.name, t.uri);
      },
      isTreeHandle(h) { return !!(h && h.__leadacidTree); },
    };
  })();

  return { present, native, stream, version, keepAwake, publish, publishStream, share, shareText, attest, files, fileSource, fileBlob, fsBackend, orientation, orientationFromRotationVector, intake, gnss, camera, tree };
})();

/**
 * Android rotation vector (x, y, z[, w] = axis·sin θ/2, cos θ/2) → the W3C
 * deviceorientation triple { alpha, beta, gamma } in degrees, with the spec's
 * ranges: alpha [0, 360), beta [-180, 180), gamma [-90, 90). Both describe the
 * same thing — the rotation taking device axes (x right, y top, z out of the
 * screen) to the Earth frame (x East, y North, z Up) — so this is the quaternion
 * → matrix → Z-X'-Y'' Tait-Bryan decomposition the spec defines, with the
 * face-down half handled by the sign of R22 (= cos β cos γ, and |γ| < 90°).
 * Pure; exported for tests. Returns null for a degenerate vector.
 */
export function orientationFromRotationVector(v) {
  if (!v || v.length < 3) return null;
  let [x, y, z] = v;
  let w = v.length > 3 ? v[3] : Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  const n = Math.hypot(x, y, z, w);
  if (!(n > 0)) return null;
  x /= n; y /= n; z /= n; w /= n;
  // SensorManager.getRotationMatrixFromVector — device → world (ENU), row-major.
  const r01 = 2 * x * y - 2 * z * w;
  const r11 = 1 - 2 * x * x - 2 * z * z;
  const r20 = 2 * x * z - 2 * y * w;
  const r21 = 2 * y * z + 2 * x * w;
  const r22 = 1 - 2 * x * x - 2 * y * y;
  const D = 180 / Math.PI;
  let alpha, beta, gamma;
  if (r22 >= 0) {            // screen up: cos β ≥ 0
    alpha = Math.atan2(-r01, r11);
    beta = Math.asin(Math.max(-1, Math.min(1, r21)));
    gamma = Math.atan2(-r20, r22);
  } else {                   // screen down: cos β < 0 → fold β past ±90°
    alpha = Math.atan2(r01, -r11);
    beta = Math.PI - Math.asin(Math.max(-1, Math.min(1, r21)));
    gamma = Math.atan2(r20, -r22);
  }
  alpha *= D; beta *= D; gamma *= D;
  alpha = ((alpha % 360) + 360) % 360;
  if (beta >= 180) beta -= 360;
  if (beta < -180) beta += 360;
  if (gamma >= 90) gamma -= 180;      // keep the spec's half-open [-90, 90)
  if (gamma < -90) gamma += 180;
  return { alpha, beta, gamma };
}
