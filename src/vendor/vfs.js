// ⚠ VENDORED — DO NOT EDIT. @gcu/vfs, copied from ../auditable/ext/vfs/index.js (built from its src/ by node ext/vfs/build.js), at
// auditable 8837da6e. golem's shell keeps sessions, device state, files and packs in it over IndexedDB (src/shell/store.js).
// golem constructs only IDBBackend and MemoryBackend; the network backends in this bundle (fetch, REST, Dropbox) are
// never constructed, so they make no request.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/vfs/src/  Build: node ext/vfs/build.js
// @gcu/vfs — Virtual filesystem with pluggable backends and mount table

// -- error.js --

const VFS_ERROR_MESSAGES = {
  ENOENT: 'no such file or directory',
  EEXIST: 'file already exists',
  EISDIR: 'is a directory',
  ENOTDIR: 'not a directory',
  ENOTEMPTY: 'directory not empty',
  ENOSPC: 'no space left on device',
  EACCES: 'permission denied',
  EXDEV: 'cross-device link',
  ENOTSUP: 'operation not supported',
  EBUSY: 'resource busy or rate-limited',
  EIO: 'input/output error',
};

class VFSError extends Error {
  // `extra` (optional) carries backend-specific fields onto the error — e.g. DropboxBackend
  // attaches { retryAfterMs } on EBUSY and { failed } on a partial batch.
  constructor(code, path, message, extra) {
    const msg = message || `${VFS_ERROR_MESSAGES[code] || code}: ${path}`;
    super(msg);
    this.code = code;
    this.path = path;
    this.name = 'VFSError';
    if (extra) Object.assign(this, extra);
  }
}

function vfsError(code, path, detail) {
  const base = VFS_ERROR_MESSAGES[code] || code;
  const msg = detail ? `${base}: ${path} (${detail})` : `${base}: ${path}`;
  return new VFSError(code, path, msg);
}

// -- path.js --

const MIME_TABLE = {
  csv: 'text/csv',
  json: 'application/json',
  geojson: 'application/geo+json',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  md: 'text/markdown',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  wasm: 'application/wasm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  bin: 'application/octet-stream',
  geotiff: 'image/tiff',
  shp: 'application/x-shapefile',
  dbf: 'application/x-dbf',
  prj: 'text/plain',
  yaml: 'text/yaml',
  yml: 'text/yaml',
};

function normalize(p) {
  if (!p || p === '/') return '/';
  // Collapse multiple slashes, resolve . and ..
  const parts = p.split('/');
  const resolved = [];
  const isAbs = parts[0] === '';
  for (let i = isAbs ? 1 : 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (isAbs) {
        // Root clamp: /../foo -> /foo
        resolved.pop();
      } else if (resolved.length && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else {
        resolved.push('..');
      }
    } else {
      resolved.push(seg);
    }
  }
  const result = (isAbs ? '/' : '') + resolved.join('/');
  return result || (isAbs ? '/' : '.');
}

function join(...parts) {
  return normalize(parts.filter(Boolean).join('/'));
}

function dirname(p) {
  const n = normalize(p);
  if (n === '/') return '/';
  const last = n.lastIndexOf('/');
  if (last <= 0) return '/';
  return n.slice(0, last);
}

function basename(p) {
  const n = normalize(p);
  if (n === '/') return '/';
  const last = n.lastIndexOf('/');
  return last === -1 ? n : n.slice(last + 1);
}

function extname(p) {
  const b = basename(p);
  const dot = b.lastIndexOf('.');
  if (dot <= 0) return '';
  return b.slice(dot);
}

function isAbsolute(p) {
  return typeof p === 'string' && p.length > 0 && p[0] === '/';
}

function resolve(...parts) {
  let result = '';
  for (const p of parts) {
    if (!p) continue;
    if (p[0] === '/') {
      result = p;
    } else {
      result = result ? result + '/' + p : p;
    }
  }
  return normalize(result || '/');
}

function relative(from, to) {
  const f = normalize(from).split('/').filter(Boolean);
  const t = normalize(to).split('/').filter(Boolean);
  let common = 0;
  while (common < f.length && common < t.length && f[common] === t[common]) {
    common++;
  }
  const ups = f.length - common;
  const downs = t.slice(common);
  const parts = [];
  for (let i = 0; i < ups; i++) parts.push('..');
  parts.push(...downs);
  return parts.join('/') || '.';
}

function mime(p) {
  const ext = extname(p).slice(1).toLowerCase();
  return MIME_TABLE[ext] || 'application/octet-stream';
}

const path = { join, dirname, basename, extname, normalize, resolve, isAbsolute, relative, mime };

// -- emitter.js --

class EventEmitter {
  constructor() {
    this._handlers = new Map();
  }
  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return this;
  }
  off(event, handler) {
    const set = this._handlers.get(event);
    if (set) set.delete(handler);
    return this;
  }
  emit(event, data) {
    const set = this._handlers.get(event);
    if (set) for (const fn of set) fn(data);
  }
}

// -- backend.js --

class Backend {
  static type = 'base';

  async init() {}
  async destroy() {}

  async exists(p) {
    try { await this.stat(p); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  }

  async cp(src, dst, opts) {
    const info = await this.stat(src);
    if (info.type === 'directory') {
      if (!opts || !opts.recursive) throw vfsError('EISDIR', src);
      await this._cpRecursive(src, dst);
    } else {
      const isBytes = info._binary;
      const content = await this.readFile(src, isBytes ? 'bytes' : 'utf8');
      try { await this.mkdir(dst.split('/').slice(0, -1).join('/') || '/'); } catch {}
      await this.writeFile(dst, content);
    }
  }

  async _cpRecursive(src, dst) {
    try { await this.mkdir(dst); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const entries = await this.readdir(src);
    for (const name of entries) {
      const srcChild = src === '/' ? '/' + name : src + '/' + name;
      const dstChild = dst === '/' ? '/' + name : dst + '/' + name;
      const info = await this.stat(srcChild);
      if (info.type === 'directory') {
        await this._cpRecursive(srcChild, dstChild);
      } else {
        const content = await this.readFile(srcChild, info._binary ? 'bytes' : 'utf8');
        await this.writeFile(dstChild, content);
      }
    }
  }

  async touch(p) {
    try {
      const info = await this.stat(p);
      if (info.type === 'file') {
        // Update mtime — re-read and re-write
        const content = await this.readFile(p, 'bytes');
        await this.writeFile(p, content);
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        await this.writeFile(p, '');
      } else throw e;
    }
  }

  async lstat(p) {
    return this.stat(p);
  }

  async export(basePath) {
    const result = {};
    const _walk = async (dir, prefix) => {
      const entries = await this.readdir(dir);
      for (const name of entries) {
        const full = dir === '/' ? '/' + name : dir + '/' + name;
        const rel = prefix ? prefix + '/' + name : name;
        const info = await this.stat(full);
        if (info.type === 'directory') {
          await _walk(full, rel);
        } else {
          const content = await this.readFile(full);
          result[rel] = content;
        }
      }
    };
    await _walk(basePath, '');
    return result;
  }

  async import(basePath, data) {
    // Collect and sort paths so directories come first
    const paths = Object.keys(data).sort();
    // Fast path: if this backend has a bulk writer, let it do the whole import in few ops (it creates parent
    // dirs itself — IDB mkdir-p in-tx, Dropbox auto-creates, CommentBackend uses implicit dirs).
    if (typeof this.writeFiles === 'function') {
      await this.writeFiles(paths.map((rel) => ({ path: basePath === '/' ? '/' + rel : basePath + '/' + rel, content: data[rel] })));
      return;
    }
    const createdDirs = new Set();
    for (const rel of paths) {
      const full = basePath === '/' ? '/' + rel : basePath + '/' + rel;
      // Ensure parent directories exist
      const parts = rel.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = basePath === '/'
          ? '/' + parts.slice(0, i).join('/')
          : basePath + '/' + parts.slice(0, i).join('/');
        if (!createdDirs.has(dir)) {
          try { await this.mkdir(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; }
          createdDirs.add(dir);
        }
      }
      await this.writeFile(full, data[rel]);
    }
  }

  createReadStream() { return null; }
  createWriter() { return null; }

  // Resolve a path to its NATIVE source without decoding — a `File` the consumer
  // can run its own stream/parse over and `postMessage`-transfer into a worker
  // ("phonebook, then get out of the pipe"; spec_inbox/vfs-streaming-spec.md §1).
  // Base fallback reads + wraps — works everywhere but is NOT lazy, so `nativeFile`
  // stays false here; handle/OPFS override with the lazy native handle.
  async toFile(p) {
    const bytes = await this.readFile(p, 'bytes');
    return new File([bytes], p.split('/').pop() || 'file');
  }
  // The backend-native file handle (FSAA `FileSystemFileHandle`, …), or null.
  async resolveHandle() { return null; }
  // Read a byte range WITHOUT reading the whole file. null ⇒ this backend can't
  // seek — the caller checks `rangeReadable` and falls back knowingly; we never
  // silently read a multi-GB file here (that would defeat the point).
  async readRange() { return null; }

  // Worker-replication: return a structured-cloneable config that a worker
  // can pass back to the constructor (alongside the type string from
  // BACKEND_TYPES) to instantiate a peer backend that talks to the same
  // underlying storage. Return null (the default) to indicate this backend
  // CANNOT be replicated in a worker — @gcu/proc will fall back to RPC.
  //
  // Backends that override should restrict themselves to JSON-cloneable
  // config (no closures, no DOM handles, no callbacks). E.g. IDBBackend
  // returns { type: 'idb', name }; MemoryBackend / CommentBackend /
  // FSAABackend / AbusBackend all keep the null default because their state
  // either lives on the main thread (Memory) or requires DOM (Comment) or
  // requires a single permission-bound handle (FSAA) or is broker-bound
  // (Abus). FetchBackend / RESTBackend override only when their headers
  // config is a plain object — function-typed headers are non-serializable.
  toConfig() { return null; }

  get readonly() { return false; }
  get persistent() { return false; }
  get streamable() { return false; }
  get estimatable() { return false; }
  get nativeFile() { return false; }    // toFile yields a lazy native handle (no full read)
  get rangeReadable() { return false; } // readRange seeks (no full read)
  get exportable() { return true; }
  get portable() { return false; }
  get symlinks() { return false; }
  // true ⇒ rmdir(p, { recursive: true }) deletes a non-empty subtree natively (one op). The router uses it for
  // vfs.rm({recursive}) instead of walking. Optional bulk methods (writeFiles/deleteBatch/listTree) and the
  // change feed (latestCursor/changes/longpoll) are detected by presence — implement them to opt in.
  get recursiveRemove() { return false; }
}

// -- memory.js --

const MAX_SYMLINK_DEPTH = 40;

function _makeNode(type, content) {
  const now = new Date();
  const node = {
    _meta: {
      type,
      size: 0,
      created: now,
      modified: now,
      mode: type === 'directory' ? 0o755 : 0o644,
      owner: 'user',
      group: 'staff',
    },
  };
  if (type === 'directory') {
    node._children = new Map();
  } else if (type === 'file') {
    node._content = content !== undefined ? content : '';
    node._meta.size = typeof node._content === 'string'
      ? new TextEncoder().encode(node._content).byteLength
      : node._content.byteLength;
  } else if (type === 'symlink') {
    node._target = content || '';
  }
  return node;
}

class MemoryBackend extends Backend {
  static type = 'memory';

  constructor() {
    super();
    this._root = _makeNode('directory');
  }

  _segments(p) {
    const n = path.normalize(p);
    if (n === '/') return [];
    return n.split('/').filter(Boolean);
  }

  _resolve(p, followSymlinks = true) {
    const segs = this._segments(p);
    let node = this._root;
    let depth = 0;

    for (let i = 0; i < segs.length; i++) {
      // Follow symlink if current node is a symlink
      if (followSymlinks && node._meta.type === 'symlink') {
        const target = node._target;
        node = this._resolve(target, true);
        depth++;
        if (depth > MAX_SYMLINK_DEPTH) throw vfsError('ENOENT', p, 'too many symlinks');
      }

      if (node._meta.type !== 'directory') {
        throw vfsError('ENOTDIR', p);
      }

      const child = node._children.get(segs[i]);
      if (!child) throw vfsError('ENOENT', p);
      node = child;
    }

    // Follow final symlink
    if (followSymlinks && node._meta.type === 'symlink') {
      depth++;
      if (depth > MAX_SYMLINK_DEPTH) throw vfsError('ENOENT', p, 'too many symlinks');
      node = this._resolve(node._target, true);
    }

    return node;
  }

  _resolveParent(p) {
    const segs = this._segments(p);
    if (segs.length === 0) throw vfsError('EEXIST', '/');
    const name = segs.pop();
    let node = this._root;
    for (const seg of segs) {
      if (node._meta.type === 'symlink') {
        node = this._resolve(node._target, true);
      }
      if (node._meta.type !== 'directory') throw vfsError('ENOTDIR', p);
      const child = node._children.get(seg);
      if (!child) throw vfsError('ENOENT', p);
      node = child;
    }
    if (node._meta.type === 'symlink') {
      node = this._resolve(node._target, true);
    }
    if (node._meta.type !== 'directory') throw vfsError('ENOTDIR', p);
    return [node, name];
  }

  async readFile(p, encoding) {
    const node = this._resolve(p);
    if (node._meta.type === 'directory') throw vfsError('EISDIR', p);
    if (node._meta.type === 'symlink') throw vfsError('ENOENT', p);
    const content = node._content;
    if (encoding === 'bytes') {
      if (content instanceof Uint8Array) return new Uint8Array(content);
      return new TextEncoder().encode(content);
    }
    if (content instanceof Uint8Array) return new TextDecoder().decode(content);
    return content;
  }

  // Resident bytes → a range is a cheap subarray (no re-read).
  get rangeReadable() { return true; }
  async readRange(p, offset, length) {
    const b = await this.readFile(p, 'bytes');
    return b.subarray(offset, offset + length);
  }

  async writeFile(p, content) {
    const [parent, name] = this._resolveParent(p);
    const existing = parent._children.get(name);
    if (existing && existing._meta.type === 'directory') throw vfsError('EISDIR', p);

    const node = existing || _makeNode('file');
    node._content = content;
    node._meta.type = 'file';
    node._meta.modified = new Date();
    node._meta.size = typeof content === 'string'
      ? new TextEncoder().encode(content).byteLength
      : (content instanceof Uint8Array ? content.byteLength : 0);
    if (!existing) {
      node._meta.created = new Date();
    }
    parent._children.set(name, node);
  }

  async unlink(p) {
    const [parent, name] = this._resolveParent(p);
    const child = parent._children.get(name);
    if (!child) throw vfsError('ENOENT', p);
    if (child._meta.type === 'directory') throw vfsError('EISDIR', p);
    parent._children.delete(name);
  }

  async rename(oldP, newP) {
    const [oldParent, oldName] = this._resolveParent(oldP);
    const child = oldParent._children.get(oldName);
    if (!child) throw vfsError('ENOENT', oldP);

    const [newParent, newName] = this._resolveParent(newP);
    const existingNew = newParent._children.get(newName);

    // Can't overwrite a non-empty directory
    if (existingNew && existingNew._meta.type === 'directory' && existingNew._children.size > 0) {
      throw vfsError('ENOTEMPTY', newP);
    }
    // Can't overwrite a directory with a file
    if (existingNew && existingNew._meta.type === 'directory' && child._meta.type !== 'directory') {
      throw vfsError('EISDIR', newP);
    }

    oldParent._children.delete(oldName);
    child._meta.modified = new Date();
    newParent._children.set(newName, child);
  }

  async stat(p) {
    const node = this._resolve(p);
    const m = node._meta;
    return {
      type: m.type,
      size: m.size,
      created: m.created,
      modified: m.modified,
      mode: m.mode,
      owner: m.owner,
      group: m.group,
    };
  }

  async lstat(p) {
    const node = this._resolve(p, false);
    const m = node._meta;
    const result = {
      type: m.type,
      size: m.size,
      created: m.created,
      modified: m.modified,
      mode: m.mode,
      owner: m.owner,
      group: m.group,
    };
    if (m.type === 'symlink') result.target = node._target;
    return result;
  }

  async mkdir(p, opts) {
    if (opts && opts.recursive) return this._mkdirRecursive(p);
    const [parent, name] = this._resolveParent(p);
    if (parent._children.has(name)) throw vfsError('EEXIST', p);
    parent._children.set(name, _makeNode('directory'));
  }

  async _mkdirRecursive(p) {
    const segs = this._segments(p);
    let node = this._root;
    for (const seg of segs) {
      if (node._meta.type !== 'directory') throw vfsError('ENOTDIR', p);
      if (!node._children.has(seg)) {
        node._children.set(seg, _makeNode('directory'));
      }
      node = node._children.get(seg);
    }
  }

  async readdir(p) {
    const node = this._resolve(p);
    if (node._meta.type !== 'directory') throw vfsError('ENOTDIR', p);
    return [...node._children.keys()].sort();
  }

  async rmdir(p) {
    const [parent, name] = this._resolveParent(p);
    const child = parent._children.get(name);
    if (!child) throw vfsError('ENOENT', p);
    if (child._meta.type !== 'directory') throw vfsError('ENOTDIR', p);
    if (child._children.size > 0) throw vfsError('ENOTEMPTY', p);
    parent._children.delete(name);
  }

  async symlink(target, p) {
    const [parent, name] = this._resolveParent(p);
    if (parent._children.has(name)) throw vfsError('EEXIST', p);
    const node = _makeNode('symlink', target);
    parent._children.set(name, node);
  }

  async readlink(p) {
    const node = this._resolve(p, false);
    if (node._meta.type !== 'symlink') throw vfsError('ENOENT', p, 'not a symlink');
    return node._target;
  }

  async chmod(p, mode) {
    const node = this._resolve(p);
    node._meta.mode = mode;
  }

  async chown(p, owner, group) {
    const node = this._resolve(p);
    if (owner !== undefined) node._meta.owner = owner;
    if (group !== undefined) node._meta.group = group;
  }

  async estimate() {
    return { used: this._calcSize(this._root), available: Infinity };
  }

  _calcSize(node) {
    if (node._meta.type === 'file') return node._meta.size;
    if (node._meta.type !== 'directory') return 0;
    let total = 0;
    for (const child of node._children.values()) {
      total += this._calcSize(child);
    }
    return total;
  }

  get symlinks() { return true; }
}

// -- idb.js --

class IDBBackend extends Backend {
  static type = 'idb';

  constructor(config) {
    super();
    this._dbName = (config && config.name) || 'gcu-vfs';
    this._db = null;
  }

  toConfig() {
    return { type: 'idb', name: this._dbName };
  }

  async init() {
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'path' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Ensure root directory exists
    const root = await this._get('/');
    if (!root) {
      const now = new Date();
      await this._put({
        path: '/', type: 'directory', content: null,
        size: 0, created: now, modified: now,
        mode: 0o755, owner: 'user', group: 'staff',
      });
    }
  }

  async destroy() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  _tx(mode) {
    const tx = this._db.transaction('files', mode);
    return tx.objectStore('files');
  }

  // Run several requests in ONE transaction (a compound op = one commit, and atomic). `q(req)` awaits a
  // request's result WITHOUT releasing the tx — a pending request keeps it alive. CONSTRAINT: `fn` must only
  // await q(...) on `store`, never a foreign promise — IndexedDB auto-commits the moment its request queue
  // goes idle, so awaiting anything else commits the tx and the next op throws TransactionInactiveError.
  // (fake-indexeddb models this faithfully, so the tests catch a violation.)
  _inTx(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('files', mode);
      const store = tx.objectStore('files');
      const q = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      let out, failed;
      tx.oncomplete = () => (failed ? reject(failed) : resolve(out));
      tx.onabort = () => reject(failed || tx.error || new Error('transaction aborted'));
      tx.onerror = () => reject(failed || tx.error);
      // call fn synchronously so its first request is issued before the tx can go idle
      Promise.resolve(fn(store, q)).then((r) => { out = r; }, (e) => { failed = e; try { tx.abort(); } catch { /* already settled */ } });
    });
  }

  // collect a key range via cursor, applying `each(entry, store)` per entry — all within `store`'s tx.
  _eachInRange(store, lower, upper, each) {
    return new Promise((resolve, reject) => {
      const req = store.openCursor(IDBKeyRange.bound(lower, upper, false, true));
      req.onsuccess = () => { const c = req.result; if (!c) return resolve(); each(c.value, store); c.continue(); };
      req.onerror = () => reject(req.error);
    });
  }

  _get(p) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').get(p);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _put(record) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _del(p) {
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').delete(p);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _cursorRange(prefix) {
    // All paths that start with prefix
    const lower = prefix === '/' ? '/' : prefix + '/';
    const upper = prefix === '/' ? '/\uffff' : prefix + '/\uffff';
    return { lower, upper };
  }

  _scan(prefix) {
    return new Promise((resolve, reject) => {
      const store = this._tx('readonly');
      const { lower, upper } = this._cursorRange(prefix);
      const range = IDBKeyRange.bound(lower, upper, false, true);
      const results = [];
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async readFile(p, encoding) {
    const np = path.normalize(p);
    const rec = await this._get(np);
    if (!rec) throw vfsError('ENOENT', np);
    if (rec.type === 'directory') throw vfsError('EISDIR', np);
    if (encoding === 'bytes') {
      if (rec.content instanceof Uint8Array) return new Uint8Array(rec.content);
      return new TextEncoder().encode(rec.content || '');
    }
    if (rec.content instanceof Uint8Array) return new TextDecoder().decode(rec.content);
    return rec.content || '';
  }

  _fileRecord(np, content, existing) {
    const now = new Date();
    const isBinary = content instanceof Uint8Array;
    const size = typeof content === 'string' ? new TextEncoder().encode(content).byteLength : (isBinary ? content.byteLength : 0);
    return {
      path: np, type: 'file', content, size,
      created: existing ? existing.created : now, modified: now,
      mode: existing ? existing.mode : 0o644,
      owner: existing ? existing.owner : 'user',
      group: existing ? existing.group : 'staff',
      _binary: isBinary,
    };
  }

  async writeFile(p, content) {
    const np = path.normalize(p);
    const parentPath = path.dirname(np);
    // one transaction: parent-check + existing-check + put (was 3 separate transactions; now atomic — no
    // TOCTOU on the parent between check and write).
    await this._inTx('readwrite', async (store, q) => {
      if (parentPath !== np) {
        const parent = await q(store.get(parentPath));
        if (!parent) throw vfsError('ENOENT', np);
        if (parent.type !== 'directory') throw vfsError('ENOTDIR', np);
      }
      const existing = await q(store.get(np));
      if (existing && existing.type === 'directory') throw vfsError('EISDIR', np);
      store.put(this._fileRecord(np, content, existing));
    });
  }

  // Bulk write — many files in ONE transaction (chunked), with any missing parent dirs created in the same
  // tx. The IDB twin of DropboxBackend.writeFiles; the big win for a mobile copy-in (was ~3 tx/file).
  async writeFiles(files) {
    if (!files || !files.length) return { committed: 0 };
    let committed = 0;
    for (let i = 0; i < files.length; i += 1000) {
      const chunk = files.slice(i, i + 1000);
      await this._inTx('readwrite', async (store, q) => {
        const ensured = new Set(['/']);
        for (const f of chunk) {                          // mkdir -p the ancestors, once each
          const segs = path.normalize(f.path).split('/').filter(Boolean); segs.pop();
          let cur = '';
          for (const seg of segs) {
            cur += '/' + seg;
            if (ensured.has(cur)) continue;
            ensured.add(cur);
            if (!(await q(store.get(cur)))) {
              const now = new Date();
              store.put({ path: cur, type: 'directory', content: null, size: 0, created: now, modified: now, mode: 0o755, owner: 'user', group: 'staff' });
            }
          }
        }
        for (const f of chunk) store.put(this._fileRecord(path.normalize(f.path), f.content, null));
      });
      committed += chunk.length;
    }
    return { committed };
  }

  async stat(p) {
    const np = path.normalize(p);
    const rec = await this._get(np);
    if (!rec) throw vfsError('ENOENT', np);
    return {
      type: rec.type,
      size: rec.size || 0,
      created: rec.created instanceof Date ? rec.created : new Date(rec.created),
      modified: rec.modified instanceof Date ? rec.modified : new Date(rec.modified),
      mode: rec.mode != null ? rec.mode : (rec.type === 'directory' ? 0o755 : 0o644),
      owner: rec.owner || 'user',
      group: rec.group || 'staff',
    };
  }

  async mkdir(p, opts) {
    const np = path.normalize(p);
    if (opts && opts.recursive) return this._mkdirRecursive(np);
    const parentPath = path.dirname(np);
    await this._inTx('readwrite', async (store, q) => {
      if (parentPath !== np) {
        if (!(await q(store.get(parentPath)))) throw vfsError('ENOENT', np);
      }
      if (await q(store.get(np))) throw vfsError('EEXIST', np);
      const now = new Date();
      store.put({ path: np, type: 'directory', content: null, size: 0, created: now, modified: now, mode: 0o755, owner: 'user', group: 'staff' });
    });
  }

  async _mkdirRecursive(np) {
    await this._inTx('readwrite', async (store, q) => {
      const segs = np.split('/').filter(Boolean);
      let current = '';
      for (const seg of segs) {
        current += '/' + seg;
        if (!(await q(store.get(current)))) {
          const now = new Date();
          store.put({ path: current, type: 'directory', content: null, size: 0, created: now, modified: now, mode: 0o755, owner: 'user', group: 'staff' });
        }
      }
    });
  }

  async readdir(p) {
    const np = path.normalize(p);
    const rec = await this._get(np);
    if (!rec) throw vfsError('ENOENT', np);
    if (rec.type !== 'directory') throw vfsError('ENOTDIR', np);

    const all = await this._scan(np);
    const prefix = np === '/' ? '/' : np + '/';
    const names = new Set();
    for (const entry of all) {
      const rel = entry.path.slice(prefix.length);
      if (!rel) continue;
      // Direct children only: no '/' in the remaining path
      const slashIdx = rel.indexOf('/');
      names.add(slashIdx === -1 ? rel : rel.slice(0, slashIdx));
    }
    return [...names].sort();
  }

  async rmdir(p, opts) {
    const np = path.normalize(p);
    if (opts && opts.recursive) return this._rmdirRecursive(np);
    await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(np));
      if (!rec) throw vfsError('ENOENT', np);
      if (rec.type !== 'directory') throw vfsError('ENOTDIR', np);
      const { lower, upper } = this._cursorRange(np);
      if (await q(store.openCursor(IDBKeyRange.bound(lower, upper, false, true)))) throw vfsError('ENOTEMPTY', np);   // any child?
      store.delete(np);
    });
  }

  // Recursive delete — store.delete(range) wipes the whole subtree in ONE request (+ the dir record). The IDB
  // twin of FSA's removeEntry({recursive}); was readdir + a stat + a delete PER descendant across N transactions.
  async _rmdirRecursive(np) {
    await this._inTx('readwrite', async (store, q) => {
      if (!(await q(store.get(np)))) throw vfsError('ENOENT', np);
      const { lower, upper } = this._cursorRange(np);
      store.delete(IDBKeyRange.bound(lower, upper, false, true));   // the entire subtree, one request
      store.delete(np);                                             // the directory record itself
    });
  }

  async unlink(p) {
    const np = path.normalize(p);
    await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(np));
      if (!rec) throw vfsError('ENOENT', np);
      if (rec.type === 'directory') throw vfsError('EISDIR', np);
      store.delete(np);
    });
  }

  // Bulk delete — many paths in one transaction (chunked).
  async deleteBatch(paths) {
    if (!paths || !paths.length) return { deleted: 0 };
    let deleted = 0;
    for (let i = 0; i < paths.length; i += 1000) {
      const chunk = paths.slice(i, i + 1000);
      await this._inTx('readwrite', async (store) => { for (const pp of chunk) store.delete(path.normalize(pp)); });
      deleted += chunk.length;
    }
    return { deleted };
  }

  // One transaction for the whole move — and ATOMIC (was ~2N+1 transactions for an N-entry subtree, leaving a
  // half-moved tree if it crashed mid-rename). IDB is transactional, so unlike FSA this rename is truly atomic.
  async rename(oldP, newP) {
    const oldNp = path.normalize(oldP);
    const newNp = path.normalize(newP);
    await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(oldNp));
      if (!rec) throw vfsError('ENOENT', oldNp);
      store.delete(oldNp);
      store.put({ ...rec, path: newNp, modified: new Date() });
      if (rec.type === 'directory') {
        // re-key every descendant — put+delete issued INSIDE the cursor walk so a request is always pending
        // (no foreign await ⇒ the tx never goes idle mid-move).
        const oldPrefix = oldNp === '/' ? '/' : oldNp + '/';
        const newPrefix = newNp === '/' ? '/' : newNp + '/';
        const { lower, upper } = this._cursorRange(oldNp);
        await this._eachInRange(store, lower, upper, (entry, s) => {
          s.put({ ...entry, path: newPrefix + entry.path.slice(oldPrefix.length) });
          s.delete(entry.path);
        });
      }
    });
  }

  async touch(p) {
    const np = path.normalize(p);
    const existed = await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(np));
      if (!rec) return false;
      if (rec.type === 'file') { rec.modified = new Date(); store.put(rec); }
      return true;
    });
    if (!existed) await this.writeFile(np, '');
  }

  async chmod(p, mode) {
    const np = path.normalize(p);
    await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(np));
      if (!rec) throw vfsError('ENOENT', np);
      rec.mode = mode; store.put(rec);
    });
  }

  async chown(p, owner, group) {
    const np = path.normalize(p);
    await this._inTx('readwrite', async (store, q) => {
      const rec = await q(store.get(np));
      if (!rec) throw vfsError('ENOENT', np);
      if (owner !== undefined) rec.owner = owner;
      if (group !== undefined) rec.group = group;
      store.put(rec);
    });
  }

  async estimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { used: est.usage || 0, available: (est.quota || 0) - (est.usage || 0) };
    }
    // Fallback: sum record sizes
    const all = await this._scan('/');
    let used = 0;
    for (const entry of all) used += entry.size || 0;
    return { used, available: Infinity };
  }

  get persistent() { return true; }
  get estimatable() { return true; }
  get recursiveRemove() { return true; }   // store.delete(IDBKeyRange) — see _rmdirRecursive
}

// -- comment.js --

class CommentBackend extends Backend {
  static type = 'comment';

  constructor(config) {
    super();
    this._map = new Map();
    this._commentNode = null;
    this._dataMode = !!(config && config.data);
    this._initData = (config && config.data) || null;
  }

  async init() {
    if (this._initData) {
      // Data mode: load from provided object
      for (const [key, entry] of Object.entries(this._initData)) {
        this._map.set(key, { ...entry });
      }
    } else if (typeof document !== 'undefined') {
      // DOM mode: find existing AUDITABLE-FS comment
      this._commentNode = this._findComment();
      if (this._commentNode) {
        const raw = this._commentNode.nodeValue.replace(/^AUDITABLE-FS\n/, '').replace(/\nAUDITABLE-FS$/, '');
        const obj = this._decode(raw);
        for (const [key, entry] of Object.entries(obj)) {
          this._map.set(key, entry);
        }
      }
    }
  }

  _findComment() {
    if (typeof document === 'undefined') return null;
    const walker = document.createTreeWalker(document, 128 /* NodeFilter.SHOW_COMMENT */);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.startsWith('AUDITABLE-FS\n')) {
        return walker.currentNode;
      }
    }
    return null;
  }

  _toRel(p) {
    // Strip leading / for internal storage
    const np = path.normalize(p);
    return np === '/' ? '' : np.slice(1);
  }

  _toAbs(rel) {
    return rel ? '/' + rel : '/';
  }

  _encode(obj) {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    // Split into 76-char lines
    const lines = [];
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76));
    }
    return lines.join('\n');
  }

  _decode(raw) {
    const stripped = raw.replace(/\s/g, '');
    // Legacy raw JSON detection
    if (stripped.startsWith('{')) {
      return JSON.parse(stripped);
    }
    const json = decodeURIComponent(escape(atob(stripped)));
    return JSON.parse(json);
  }

  _syncComment() {
    if (!this._commentNode) return;
    const obj = Object.fromEntries(this._map);
    this._commentNode.nodeValue = 'AUDITABLE-FS\n' + this._encode(obj) + '\nAUDITABLE-FS';
  }

  async readFile(p, encoding) {
    const rel = this._toRel(p);
    const entry = this._map.get(rel);
    if (!entry) throw vfsError('ENOENT', p);

    let raw;
    if (entry.compressed && typeof DecompressionStream !== 'undefined') {
      // Decompress gzip base64
      const bytes = Uint8Array.from(atob(entry.data), c => c.charCodeAt(0));
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { result.set(c, offset); offset += c.byteLength; }
      raw = result;
    } else if (entry.data) {
      // Uncompressed base64
      const binary = atob(entry.data);
      raw = Uint8Array.from(binary, c => c.charCodeAt(0));
    } else {
      raw = new Uint8Array(0);
    }

    if (encoding === 'bytes') return raw;
    return new TextDecoder().decode(raw);
  }

  // gzip+base64 one file → an AUDITABLE-FS map entry. The only async/expensive part of a write; pulled out so
  // writeFiles can encode many then sync the comment ONCE (writeFile/_syncComment re-serialize the whole map).
  async _encodeEntry(p, content) {
    const mimeType = path.mime(p);
    const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content || '');
    const size = bytes.byteLength;
    let data, compressed = false;
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter(); writer.write(bytes); writer.close();
      const reader = cs.readable.getReader(); const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      const gz = new Uint8Array(total); let off = 0;
      for (const c of chunks) { gz.set(c, off); off += c.byteLength; }
      if (gz.byteLength < bytes.byteLength) { data = btoa(String.fromCharCode(...gz)); compressed = true; }
      else data = btoa(String.fromCharCode(...bytes));
    } else {
      data = btoa(String.fromCharCode(...bytes));
    }
    return { type: mimeType, compressed, size, data };
  }

  _assertParentDir(p) {
    // implicit dirs — just guard against writing under a file
    const parentRel = this._toRel(path.dirname(path.normalize(p)));
    if (parentRel && this._map.has(parentRel)) throw vfsError('ENOTDIR', p);
  }

  async writeFile(p, content) {
    this._assertParentDir(p);
    this._map.set(this._toRel(p), await this._encodeEntry(p, content));
    this._syncComment();
  }

  // Bulk write — encode all entries, then re-serialize the comment ONCE (vs once per file → O(N²)).
  async writeFiles(files) {
    if (!files || !files.length) return { committed: 0 };
    for (const f of files) {
      this._assertParentDir(f.path);
      this._map.set(this._toRel(f.path), await this._encodeEntry(f.path, f.content));
    }
    this._syncComment();
    return { committed: files.length };
  }

  // Bulk delete — one comment re-serialization for the whole batch.
  async deleteBatch(paths) {
    if (!paths || !paths.length) return { deleted: 0 };
    let deleted = 0;
    for (const p of paths) if (this._map.delete(this._toRel(p))) deleted++;
    this._syncComment();
    return { deleted };
  }

  async stat(p) {
    const np = path.normalize(p);
    const rel = this._toRel(np);

    // Root always exists
    if (rel === '') {
      return {
        type: 'directory', size: 0,
        created: new Date(0), modified: new Date(0),
        mode: 0o755, owner: 'user', group: 'staff',
      };
    }

    // Check if it's a file
    const entry = this._map.get(rel);
    if (entry) {
      return {
        type: 'file', size: entry.size || 0,
        created: new Date(0), modified: new Date(0),
        mode: 0o644, owner: 'user', group: 'staff',
      };
    }

    // Check if it's an implicit directory
    const prefix = rel + '/';
    for (const key of this._map.keys()) {
      if (key.startsWith(prefix)) {
        return {
          type: 'directory', size: 0,
          created: new Date(0), modified: new Date(0),
          mode: 0o755, owner: 'user', group: 'staff',
        };
      }
    }

    throw vfsError('ENOENT', np);
  }

  async mkdir(/* p, opts */) {
    // Implicit directories — mkdir is a no-op
  }

  async readdir(p) {
    const np = path.normalize(p);
    const rel = this._toRel(np);
    const prefix = rel ? rel + '/' : '';
    const names = new Set();

    for (const key of this._map.keys()) {
      if (rel === '') {
        // Root: all top-level entries
        const slashIdx = key.indexOf('/');
        names.add(slashIdx === -1 ? key : key.slice(0, slashIdx));
      } else if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest) continue;
        const slashIdx = rest.indexOf('/');
        names.add(slashIdx === -1 ? rest : rest.slice(0, slashIdx));
      }
    }

    return [...names].sort();
  }

  async rmdir(p) {
    const np = path.normalize(p);
    const rel = this._toRel(np);
    if (rel === '') throw vfsError('EACCES', np, 'cannot remove root');
    const children = await this.readdir(np);
    if (children.length > 0) throw vfsError('ENOTEMPTY', np);
    // No-op if empty (implicit directories have no record to delete)
  }

  async unlink(p) {
    const np = path.normalize(p);
    const rel = this._toRel(np);
    if (!this._map.has(rel)) throw vfsError('ENOENT', np);
    this._map.delete(rel);
    this._syncComment();
  }

  async rename(oldP, newP) {
    const oldRel = this._toRel(oldP);
    const newRel = this._toRel(newP);
    const entry = this._map.get(oldRel);
    if (!entry) throw vfsError('ENOENT', oldP);
    this._map.delete(oldRel);
    this._map.set(newRel, entry);
    this._syncComment();
  }

  async touch(p) {
    const np = path.normalize(p);
    const rel = this._toRel(np);
    if (!this._map.has(rel)) {
      // Create empty file
      this._map.set(rel, { type: path.mime(np), compressed: false, size: 0, data: '' });
      this._syncComment();
    }
    // No mtime to update in this format
  }

  async chmod() {
    // AUDITABLE-FS format doesn't store permissions — no-op
  }

  async chown() {
    // AUDITABLE-FS format doesn't store ownership — no-op
  }

  async export(basePath) {
    const np = path.normalize(basePath);
    const rel = this._toRel(np);
    const result = {};
    const prefix = rel ? rel + '/' : '';

    for (const [key, entry] of this._map) {
      let exportKey;
      if (rel === '') {
        exportKey = key;
      } else if (key.startsWith(prefix)) {
        exportKey = key.slice(prefix.length);
      } else if (key === rel) {
        // Exporting a single file
        const content = await this.readFile(np);
        return { [path.basename(np)]: content };
      } else {
        continue;
      }
      if (!exportKey) continue;
      result[exportKey] = entry;
    }
    return result;
  }

  async import(basePath, data) {
    const np = path.normalize(basePath);
    const rel = this._toRel(np);
    const prefix = rel ? rel + '/' : '';

    for (const [key, entry] of Object.entries(data)) {
      this._map.set(prefix + key, { ...entry });
    }
    this._syncComment();
  }

  getData() {
    return Object.fromEntries(this._map);
  }

  get persistent() { return true; }
  get portable() { return true; }
  get exportable() { return true; }
}

// -- handle.js --

// HandleBackend — base for FSAABackend + OPFSBackend over the File System Access API.
//
// Directory-handle cache (vfs-handle-cache-spec.md): _resolveDir used to re-walk getDirectoryHandle
// per segment FROM ROOT on every op. On desktop that's near-free; on Android a picked folder is a SAF
// content:// URI, so each getDirectoryHandle is a Binder IPC — per-op latency = O(depth) IPCs, killing
// a many-small-files copy. We cache normalizedDirPath → FileSystemDirectoryHandle, walk only from the
// deepest cached ancestor, cache intermediates, and invalidate on structural change. Stale-handle safe:
// a cached handle can go bad if the folder is removed/recreated outside the app, so a raw FSA failure on
// a (possibly cached) handle evicts + re-resolves fresh from root once before surfacing ENOENT.

class HandleBackend extends Backend {
  constructor(root) {
    super();
    this._root = root;
    this._dirCache = new Map();   // normalized dir path → FileSystemDirectoryHandle
  }

  // Drop a path and all its descendants from the cache (structural change under it).
  _evict(p) {
    const n = path.normalize(p);
    if (n === '/') { this._dirCache.clear(); return; }
    const prefix = n + '/';
    for (const key of [...this._dirCache.keys()]) {
      if (key === n || key.startsWith(prefix)) this._dirCache.delete(key);
    }
  }

  // Resolve a dir path to its handle. Cache hit → return it. Miss → walk from the deepest cached
  // ancestor (or root), caching each intermediate as we descend. `fresh` ignores the cache entirely
  // (the from-root re-resolve used after a suspected stale handle).
  async _resolveDir(p, fresh = false) {
    const n = path.normalize(p);
    if (!fresh) { const hit = this._dirCache.get(n); if (hit) return hit; }
    if (n === '/') { this._dirCache.set('/', this._root); return this._root; }
    const segs = n.split('/').filter(Boolean);
    let dir = this._root, startI = 0;
    if (!fresh) {
      for (let i = segs.length - 1; i >= 1; i--) {
        const h = this._dirCache.get('/' + segs.slice(0, i).join('/'));
        if (h) { dir = h; startI = i; break; }
      }
    }
    this._dirCache.set('/', this._root);
    let acc = startI === 0 ? '' : '/' + segs.slice(0, startI).join('/');
    for (let i = startI; i < segs.length; i++) {
      acc += '/' + segs[i];
      try {
        dir = await dir.getDirectoryHandle(segs[i]);
      } catch {
        // a cached ancestor may be stale → drop this lineage and retry once from root
        if (!fresh && startI > 0) { this._evict(n); return this._resolveDir(n, true); }
        throw vfsError('ENOENT', p);
      }
      this._dirCache.set(acc, dir);
    }
    return dir;
  }

  // Resolve `dirPath` (cached) and run fn(dirHandle). If fn throws a RAW (non-VFSError) error, the
  // cached handle may be stale: evict + re-resolve fresh from root, retry once. Typed VFSErrors
  // (EISDIR/EEXIST/ENOTDIR/ENOENT) are semantic — rethrow without retry. A missing parent throws
  // out of the initial resolve (no retry).
  async _useDir(dirPath, fn) {
    const dir = await this._resolveDir(dirPath);
    try {
      return await fn(dir);
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;
      this._evict(dirPath);
      let fresh;
      try { fresh = await this._resolveDir(dirPath, true); } catch { throw e; }
      return await fn(fresh);
    }
  }

  async _resolveFile(p, create) {
    const n = path.normalize(p);
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    try {
      return await this._useDir(parentPath, (dir) => dir.getFileHandle(name, create ? { create: true } : undefined));
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;
      throw vfsError('ENOENT', p);
    }
  }

  _resolveParent(p) {
    const n = path.normalize(p);
    return { dir: path.dirname(n), name: path.basename(n) };
  }

  async readFile(p, encoding) {
    const handle = await this._resolveFile(p);
    const file = await handle.getFile();
    if (encoding === 'bytes') {
      const buf = await file.arrayBuffer();
      return new Uint8Array(buf);
    }
    return await file.text();
  }

  async writeFile(p, content) {
    // _resolveFile resolves the parent ONCE (was resolved twice — a standalone _resolveDir plus the
    // one inside _resolveFile). getFileHandle({create:true}) creates the file (throws ENOENT if the
    // parent is missing — same as before).
    const handle = await this._resolveFile(p, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  // file-or-dir probe on an already-resolved parent handle (no extra walk). null = neither.
  async _probe(parent, name) {
    try {
      const fh = await parent.getFileHandle(name);
      const file = await fh.getFile();
      return { type: 'file', size: file.size, created: new Date(file.lastModified), modified: new Date(file.lastModified) };
    } catch { /* not a file */ }
    try {
      await parent.getDirectoryHandle(name);
      return { type: 'directory', size: 0, created: new Date(0), modified: new Date(0) };
    } catch { return null; }
  }

  async stat(p) {
    const n = path.normalize(p);
    if (n === '/') return { type: 'directory', size: 0, created: new Date(0), modified: new Date(0) };
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    // resolve the parent ONCE, probe file-then-dir on it (was two full walks: parent for the file-try,
    // then a separate _resolveDir(n) for the dir-try).
    const wasHit = this._dirCache.has(path.normalize(parentPath));
    let parent;
    try { parent = await this._resolveDir(parentPath); } catch { throw vfsError('ENOENT', p); }
    let r = await this._probe(parent, name);
    if (r) return r;
    // both missed — if the parent came from the cache it may be stale; re-resolve fresh once
    if (wasHit) {
      this._evict(parentPath);
      try { parent = await this._resolveDir(parentPath, true); } catch { throw vfsError('ENOENT', p); }
      r = await this._probe(parent, name);
      if (r) return r;
    }
    throw vfsError('ENOENT', p);
  }

  async mkdir(p, opts) {
    const n = path.normalize(p);
    if (opts && opts.recursive) {
      const segs = n.split('/').filter(Boolean);
      let dir = this._root; this._dirCache.set('/', this._root);
      let acc = '';
      for (const seg of segs) {
        acc += '/' + seg;
        dir = await dir.getDirectoryHandle(seg, { create: true });
        this._dirCache.set(acc, dir);   // seed the cache with the created handles
      }
      return;
    }
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    const parent = await this._resolveDir(parentPath);
    // Check if exists
    try {
      await parent.getDirectoryHandle(name);
      throw vfsError('EEXIST', p);
    } catch (e) {
      if (e.code === 'EEXIST') throw e;
    }
    const h = await parent.getDirectoryHandle(name, { create: true });
    this._dirCache.set(n, h);   // seed the created dir
  }

  async readdir(p) {
    const dir = await this._resolveDir(p);
    const names = [];
    for await (const [name] of dir.entries()) {
      names.push(name);
    }
    return names.sort();
  }

  async unlink(p) {
    const n = path.normalize(p);
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    try {
      await this._useDir(parentPath, async (parent) => {
        // EISDIR if it's actually a directory; else remove (file → gone, missing → throws)
        let isDir = false;
        try { await parent.getDirectoryHandle(name); isDir = true; } catch { /* not a dir */ }
        if (isDir) throw vfsError('EISDIR', p);
        await parent.removeEntry(name);
      });
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;
      throw vfsError('ENOENT', p);
    }
  }

  async rmdir(p, opts) {
    if (opts && opts.recursive) return this._rmDir(p);   // native recursive delete (one call vs an O(subtree) walk)
    const n = path.normalize(p);
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    this._evict(n);   // the directory (and any cached descendants) is going away
    try {
      await this._useDir(parentPath, async (parent) => {
        // ENOTDIR if it's actually a file; else remove the directory
        let isFile = false;
        try { await parent.getFileHandle(name); isFile = true; } catch { /* not a file */ }
        if (isFile) throw vfsError('ENOTDIR', p);
        await parent.removeEntry(name);
      });
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;
      if (e && e.name === 'InvalidModificationError') throw vfsError('ENOTEMPTY', p);   // non-empty dir
      throw vfsError('ENOENT', p);
    }
  }

  async rename(oldP, newP) {
    // No native rename in handle APIs — read, write, delete
    const info = await this.stat(oldP);
    if (info.type === 'directory') {
      // Recursive copy then delete
      await this._cpDir(oldP, newP);
      await this._rmDir(oldP);
      this._evict(oldP);   // the source subtree is gone (rmdir already evicted its leaf; be thorough)
    } else {
      const content = await this.readFile(oldP, 'bytes');
      await this.writeFile(newP, content);
      await this.unlink(oldP);
    }
  }

  async _cpDir(src, dst) {
    await this.mkdir(dst, { recursive: true });
    const entries = await this.readdir(src);
    for (const name of entries) {
      const srcChild = path.join(src, name);
      const dstChild = path.join(dst, name);
      const info = await this.stat(srcChild);
      if (info.type === 'directory') {
        await this._cpDir(srcChild, dstChild);
      } else {
        const content = await this.readFile(srcChild, 'bytes');
        await this.writeFile(dstChild, content);
      }
    }
  }

  // Recursive directory delete. Native removeEntry({recursive:true}) is ONE call; the old hand-walk was
  // readdir + a stat + a delete PER child (each a SAF IPC on Android — O(whole subtree)). The handle-cache
  // (0.4.0) cut resolution IPCs; this removes the per-child ops entirely. Falls back to the manual walk on a
  // runtime without recursive removeEntry. (Directory rename stays copy-then-delete = non-atomic — platform
  // floor; this only makes the delete half one call.)
  async _rmDir(p) {
    const n = path.normalize(p);
    this._evict(n);   // the subtree's cached handles are invalid either way
    const parentPath = path.dirname(n);
    const name = path.basename(n);
    try {
      await this._useDir(parentPath, (parent) => parent.removeEntry(name, { recursive: true }));
      return;
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;   // a mapped error (e.g. missing parent) → propagate
      // otherwise: runtime lacks recursive removeEntry (or it threw) → fall back to the manual walk
    }
    await this._rmDirManual(p);
  }

  async _rmDirManual(p) {
    const entries = await this.readdir(p);
    for (const name of entries) {
      const child = path.join(p, name);
      const info = await this.stat(child);
      if (info.type === 'directory') {
        await this._rmDirManual(child);
      } else {
        await this.unlink(child);
      }
    }
    await this.rmdir(p);
  }

  // A lazily-resolved byte stream off the file handle — FSA file handles support .stream(). Matches
  // FetchBackend's { getReader, [asyncIterator] } shape so the `streamable` capability is honest (it used to
  // return null while `streamable` claimed true — a consumer that checked then called got nothing).
  createReadStream(p) {
    const self = this;
    return {
      async getReader() {
        const handle = await self._resolveFile(p);
        return (await handle.getFile()).stream().getReader();
      },
      [Symbol.asyncIterator]() {
        const streamPromise = self._resolveFile(p).then((h) => h.getFile()).then((f) => f.stream());
        let reader;
        return {
          async next() {
            if (!reader) reader = (await streamPromise).getReader();
            return reader.read();
          },
        };
      },
    };
  }

  async createWriter(p) {
    const handle = await this._resolveFile(p, true);
    return handle.createWritable();
  }

  get persistent() { return true; }
  get streamable() { return true; }
  get estimatable() { return true; }
  get nativeFile() { return true; }
  get rangeReadable() { return true; }

  // Native File / handle off the FSA file handle — lazy (no read), transferable.
  async toFile(p) { return (await this._resolveFile(p)).getFile(); }
  async resolveHandle(p) { return this._resolveFile(p); }
  // Blob.slice is lazy; .arrayBuffer() reads ONLY the slice (a true seek).
  async readRange(p, offset, length) {
    const file = await (await this._resolveFile(p)).getFile();
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  }
  get recursiveRemove() { return true; }   // removeEntry({recursive}) — see _rmDir

  async estimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { used: est.usage || 0, available: (est.quota || 0) - (est.usage || 0) };
    }
    return { used: 0, available: Infinity };
  }
}

// -- opfs.js --

class OPFSBackend extends HandleBackend {
  static type = 'opfs';

  constructor(config) {
    super(null);
    this._fallbackConfig = config && config.fallback;
    this._fallback = null;
  }

  toConfig() {
    // Real OPFS replicates fine: the worker gets its own origin-private
    // directory from navigator.storage.getDirectory() — same handle as
    // the main thread. When running in fallback mode (no OPFS available
    // in this context), we can't replicate because the fallback could
    // itself be non-replicable; let proc proxy instead.
    if (this._fallback) return null;
    return { type: 'opfs' };
  }

  async init() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      this._root = await navigator.storage.getDirectory();
    } else if (this._fallbackConfig) {
      // Create fallback backend via the factory function set during build
      if (typeof _createBackend === 'function') {
        this._fallback = _createBackend(this._fallbackConfig);
      } else {
        // Standalone usage — try to construct directly
        throw vfsError('ENOTSUP', '/', 'OPFS not available and no backend factory');
      }
      if (this._fallback.init) await this._fallback.init();
    } else {
      throw vfsError('ENOTSUP', '/', 'OPFS not available');
    }
  }

  // Delegate all methods when in fallback mode
  async readFile(p, encoding) {
    if (this._fallback) return this._fallback.readFile(p, encoding);
    return super.readFile(p, encoding);
  }
  async writeFile(p, content) {
    if (this._fallback) return this._fallback.writeFile(p, content);
    return super.writeFile(p, content);
  }
  async stat(p) {
    if (this._fallback) return this._fallback.stat(p);
    return super.stat(p);
  }
  async mkdir(p, opts) {
    if (this._fallback) return this._fallback.mkdir(p, opts);
    return super.mkdir(p, opts);
  }
  async readdir(p) {
    if (this._fallback) return this._fallback.readdir(p);
    return super.readdir(p);
  }
  async rmdir(p) {
    if (this._fallback) return this._fallback.rmdir(p);
    return super.rmdir(p);
  }
  async unlink(p) {
    if (this._fallback) return this._fallback.unlink(p);
    return super.unlink(p);
  }
  async rename(oldP, newP) {
    if (this._fallback) return this._fallback.rename(oldP, newP);
    return super.rename(oldP, newP);
  }
  async touch(p) {
    if (this._fallback) return this._fallback.touch(p);
    return super.touch(p);
  }
  async exists(p) {
    if (this._fallback) return this._fallback.exists(p);
    return super.exists(p);
  }
  createReadStream(p) {
    if (this._fallback) return this._fallback.createReadStream(p);
    return super.createReadStream(p);
  }
  async toFile(p) {
    if (this._fallback) return this._fallback.toFile(p);
    return super.toFile(p);
  }
  async resolveHandle(p) {
    if (this._fallback) return this._fallback.resolveHandle ? this._fallback.resolveHandle(p) : null;
    return super.resolveHandle(p);
  }
  async readRange(p, offset, length) {
    if (this._fallback) return this._fallback.readRange ? this._fallback.readRange(p, offset, length) : null;
    return super.readRange(p, offset, length);
  }
  async createWriter(p) {
    if (this._fallback) return this._fallback.createWriter(p);
    return super.createWriter(p);
  }
  async estimate() {
    if (this._fallback) return this._fallback.estimate();
    return super.estimate();
  }
  async chmod(p, mode) {
    if (this._fallback && this._fallback.chmod) return this._fallback.chmod(p, mode);
    return super.chmod(p, mode);
  }
  async chown(p, owner, group) {
    if (this._fallback && this._fallback.chown) return this._fallback.chown(p, owner, group);
    return super.chown(p, owner, group);
  }
  async destroy() {
    if (this._fallback && this._fallback.destroy) return this._fallback.destroy();
  }
  async export(basePath) {
    if (this._fallback && this._fallback.export) return this._fallback.export(basePath);
    return super.export(basePath);
  }
  async import(basePath, data) {
    if (this._fallback && this._fallback.import) return this._fallback.import(basePath, data);
    return super.import(basePath, data);
  }

  // Capabilities delegate to fallback when active
  get persistent() { return this._fallback ? !!this._fallback.persistent : true; }
  get streamable() { return this._fallback ? !!this._fallback.streamable : true; }
  get estimatable() { return this._fallback ? !!this._fallback.estimatable : true; }
  get nativeFile() { return this._fallback ? !!this._fallback.nativeFile : true; }
  get rangeReadable() { return this._fallback ? !!this._fallback.rangeReadable : true; }
  get readonly() { return this._fallback ? !!this._fallback.readonly : false; }
  get portable() { return this._fallback ? !!this._fallback.portable : false; }
  get symlinks() { return this._fallback ? !!this._fallback.symlinks : false; }
}

// -- fsaa.js --

class FSAABackend extends HandleBackend {
  static type = 'fsaa';

  constructor(config) {
    super(config && config.handle);
  }

  async init() {
    if (!this._root) {
      throw vfsError('ENOTSUP', '/', 'no directory handle provided');
    }
  }

  async queryPermission(mode) {
    if (this._root.queryPermission) {
      return this._root.queryPermission({ mode: mode || 'read' });
    }
    return 'granted';
  }

  async requestPermission(mode) {
    if (this._root.requestPermission) {
      return this._root.requestPermission({ mode: mode || 'read' });
    }
    return 'granted';
  }
}

// -- fetch-backend.js --

// -- Shared HTTP helpers (also used by rest.js via concatenation) --

function _httpUrl(base, p) {
  const normalized = path.normalize(p);
  const stripped = normalized === '/' ? '' : normalized;
  // Remove trailing slash from base, then join
  const b = base.replace(/\/+$/, '');
  // Preserve explicit trailing slash from caller (e.g. REST dir ops)
  const trailingSlash = p.length > 1 && p.endsWith('/') && !stripped.endsWith('/');
  return b + stripped + (trailingSlash ? '/' : '');
}

async function _httpHeaders(cfg) {
  if (!cfg) return {};
  if (typeof cfg === 'function') return await cfg();
  return cfg;
}

function _httpError(resp, p) {
  const status = resp.status;
  if (status === 404) return vfsError('ENOENT', p);
  if (status === 401 || status === 403) return vfsError('EACCES', p);
  if (status === 409) return vfsError('EEXIST', p);
  if (status === 413 || status === 507) return vfsError('ENOSPC', p);
  return vfsError('ENOTSUP', p, `HTTP ${status}`);
}

// -- FetchBackend --

class FetchBackend extends Backend {
  static type = 'fetch';

  constructor(config) {
    super();
    this._base = (config && config.base) || '';
    this._index = config && config.index;
    this._headersCfg = config && config.headers;
    this._credentials = config && config.credentials;
  }

  toConfig() {
    // Function-shaped headers (a callback that computes auth tokens
    // dynamically) can't be cloned across the worker boundary; force the
    // proxy path in that case so the main-thread callback still runs.
    if (typeof this._headersCfg === 'function') return null;
    const out = { type: 'fetch' };
    if (this._base) out.base = this._base;
    if (this._index !== undefined) out.index = this._index;
    if (this._headersCfg) out.headers = this._headersCfg;
    if (this._credentials) out.credentials = this._credentials;
    return out;
  }

  async _fetch(p, opts) {
    const url = _httpUrl(this._base, p);
    const headers = await _httpHeaders(this._headersCfg);
    const fetchOpts = { ...opts, headers: { ...headers, ...(opts && opts.headers) } };
    if (this._credentials) fetchOpts.credentials = this._credentials;
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok) throw _httpError(resp, p);
    return resp;
  }

  async readFile(p, encoding) {
    const resp = await this._fetch(p);
    if (encoding === 'bytes') {
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    }
    return await resp.text();
  }

  async stat(p) {
    const url = _httpUrl(this._base, p);
    const headers = await _httpHeaders(this._headersCfg);
    const fetchOpts = { method: 'HEAD', headers };
    if (this._credentials) fetchOpts.credentials = this._credentials;
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok) throw _httpError(resp, p);
    const size = parseInt(resp.headers.get('Content-Length') || '0', 10);
    const lastMod = resp.headers.get('Last-Modified');
    return {
      type: 'file',
      size: isNaN(size) ? 0 : size,
      modified: lastMod ? new Date(lastMod) : new Date(),
      created: lastMod ? new Date(lastMod) : new Date(),
    };
  }

  async readdir(p) {
    if (!this._index) throw vfsError('ENOENT', p, 'no index configured');
    const n = path.normalize(p);
    const indexPath = n === '/' ? '/' + this._index : n + '/' + this._index;
    const resp = await this._fetch(indexPath);
    return await resp.json();
  }

  createReadStream(p) {
    // Return a promise-wrapped stream
    const self = this;
    return {
      async getReader() {
        const resp = await self._fetch(p);
        return resp.body.getReader();
      },
      [Symbol.asyncIterator]() {
        const streamPromise = self._fetch(p).then(r => r.body);
        let reader;
        return {
          async next() {
            if (!reader) {
              const stream = await streamPromise;
              reader = stream.getReader();
            }
            const { done, value } = await reader.read();
            return { done, value };
          }
        };
      }
    };
  }

  // All write ops throw EACCES
  async writeFile(p) { throw vfsError('EACCES', p, 'read-only backend'); }
  async mkdir(p) { throw vfsError('EACCES', p, 'read-only backend'); }
  async unlink(p) { throw vfsError('EACCES', p, 'read-only backend'); }
  async rmdir(p) { throw vfsError('EACCES', p, 'read-only backend'); }
  async rename(p) { throw vfsError('EACCES', p, 'read-only backend'); }
  async touch(p) { throw vfsError('EACCES', p, 'read-only backend'); }

  get readonly() { return true; }
  get persistent() { return false; }
  get streamable() { return true; }
}

// -- rest.js --

class RESTBackend extends Backend {
  static type = 'rest';

  constructor(config) {
    super();
    this._base = (config && config.base) || '';
    this._headersCfg = config && config.headers;
    this._credentials = config && config.credentials;
  }

  toConfig() {
    if (typeof this._headersCfg === 'function') return null;
    const out = { type: 'rest' };
    if (this._base) out.base = this._base;
    if (this._headersCfg) out.headers = this._headersCfg;
    if (this._credentials) out.credentials = this._credentials;
    return out;
  }

  async _fetch(p, opts) {
    const url = _httpUrl(this._base, p);
    const headers = await _httpHeaders(this._headersCfg);
    const fetchOpts = { ...opts, headers: { ...headers, ...(opts && opts.headers) } };
    if (this._credentials) fetchOpts.credentials = this._credentials;
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok) throw _httpError(resp, p);
    return resp;
  }

  async readFile(p, encoding) {
    const resp = await this._fetch(p, { method: 'GET' });
    if (encoding === 'bytes') {
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    }
    return await resp.text();
  }

  async writeFile(p, content) {
    await this._fetch(p, {
      method: 'PUT',
      body: content,
    });
  }

  async stat(p) {
    const url = _httpUrl(this._base, p);
    const headers = await _httpHeaders(this._headersCfg);
    const fetchOpts = { method: 'HEAD', headers };
    if (this._credentials) fetchOpts.credentials = this._credentials;
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok) throw _httpError(resp, p);
    const size = parseInt(resp.headers.get('Content-Length') || '0', 10);
    const lastMod = resp.headers.get('Last-Modified');
    return {
      type: 'file',
      size: isNaN(size) ? 0 : size,
      modified: lastMod ? new Date(lastMod) : new Date(),
      created: lastMod ? new Date(lastMod) : new Date(),
    };
  }

  async mkdir(p) {
    const n = path.normalize(p);
    // Trailing slash signals directory creation
    await this._fetch(n + '/', { method: 'PUT' });
  }

  async readdir(p) {
    const n = path.normalize(p);
    const resp = await this._fetch(n + '/', { method: 'GET' });
    return await resp.json();
  }

  async unlink(p) {
    await this._fetch(p, { method: 'DELETE' });
  }

  async rmdir(p) {
    const n = path.normalize(p);
    await this._fetch(n + '/', { method: 'DELETE' });
  }

  async rename(oldP, newP) {
    // Not atomic: GET old → PUT new → DELETE old
    const content = await this.readFile(oldP, 'bytes');
    await this.writeFile(newP, content);
    await this.unlink(oldP);
  }

  createReadStream(p) {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        const streamPromise = self._fetch(p, { method: 'GET' }).then(r => r.body);
        let reader;
        return {
          async next() {
            if (!reader) {
              const stream = await streamPromise;
              reader = stream.getReader();
            }
            const { done, value } = await reader.read();
            return { done, value };
          }
        };
      }
    };
  }

  get persistent() { return true; }
  get streamable() { return true; }
}

// -- dropbox.js --

// DropboxBackend — a cloud VFS backend over the Dropbox HTTP API. A peer of RESTBackend:
// zero deps (just fetch), stateless about auth. The consumer (weir / auditable) owns PKCE
// OAuth and injects `getToken`; the backend calls it per request and never touches OAuth.
// Specs: spec_inbox/vfs-dropbox-backend-spec.md (the backend) + vfs-dropbox-efficiency-spec.md
// (this revision: listTree, writeFiles, centralized 429/Retry-After backpressure).

const API = 'https://api.dropboxapi.com/2/';
const CONTENT = 'https://content.dropboxapi.com/2/';
const NOTIFY = 'https://notify.dropboxapi.com/2/';

class DropboxBackend extends Backend {
  static type = 'dropbox';

  // { getToken: () => Promise<string>, root?: string,
  //   maxRetries?, maxBackoffMs?, tokenTtlMs?, uploadConcurrency?, batchPollMs?, sleep? }
  constructor(config) {
    super();
    const c = config || {};
    this._getToken = c.getToken;
    this._root = c.root || '';
    this._maxRetries = c.maxRetries ?? 6;            // bounded 429/503 retries
    this._maxBackoffMs = c.maxBackoffMs ?? 64000;    // cap any single wait
    this._tokenTtlMs = c.tokenTtlMs ?? 5000;         // brief token cache (refresh seam stays getToken)
    this._uploadConc = c.uploadConcurrency ?? 8;     // in-flight upload_session/start
    this._batchPollMs = c.batchPollMs ?? 1000;       // finish_batch/check poll spacing
    this._sleep = c.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));   // injectable for tests
    this._tok = null; this._tokExp = 0;
  }

  // getToken is a function (the consumer owns OAuth) → non-serializable, so a worker
  // can't reconstruct us → null → @gcu/proc falls back to RPC. Mirrors RESTBackend's
  // function-headers case.
  toConfig() {
    if (typeof this._getToken === 'function') return null;
    return { type: 'dropbox', root: this._root };
  }

  // Mount-relative path → Dropbox path. '' is the (app/subtree) root; otherwise a
  // leading-slash path with no trailing slash. `root` prefixes the addressed subtree.
  _dpath(p) {
    const combined = (this._root || '') + (p === '/' ? '' : p);
    const norm = combined.replace(/\/+/g, '/').replace(/\/+$/, '');
    return norm === '/' ? '' : norm;
  }

  // Inverse of _dpath: a Dropbox path_display → the VFS path (strip `root`, leading slash).
  _vpath(dp) {
    let s = dp || '';
    const root = this._root || '';
    if (root && s.slice(0, root.length).toLowerCase() === root.toLowerCase()) s = s.slice(root.length);   // Dropbox is case-insensitive
    if (!s) return '/';
    if (s[0] !== '/') s = '/' + s;
    return s.replace(/\/{2,}/g, '/');
  }

  // Brief token cache: getToken is the OAuth refresh seam, so a burst of calls shouldn't
  // hammer it. Invalidated on a 401 (see _send) and after tokenTtlMs.
  async _authHeader() {
    const now = Date.now();
    if (this._tok && now < this._tokExp) return 'Bearer ' + this._tok;
    this._tok = await this._getToken();
    this._tokExp = now + this._tokenTtlMs;
    return 'Bearer ' + this._tok;
  }

  // Single place that honors Dropbox backpressure for EVERY authenticated call. `make()`
  // rebuilds headers+fetch per attempt (so a refreshed token is picked up). On 429/503 it
  // waits Retry-After (or an exponential fallback) and retries, bounded; on a first 401 it
  // refreshes the token once and retries; otherwise it maps the error.
  async _send(make, p, attempt = 0, refreshed = false) {
    const resp = await make();
    if (resp.ok) return resp;
    const st = resp.status;
    if (st === 401 && !refreshed) { this._tok = null; this._tokExp = 0; return this._send(make, p, attempt, true); }
    if ((st === 429 || st === 503) && attempt < this._maxRetries) {
      await this._sleep(this._retryAfterMs(resp, attempt));
      return this._send(make, p, attempt + 1, refreshed);
    }
    if (st === 429 || st === 503) {
      throw new VFSError('EBUSY', p, 'dropbox rate-limited', { retryAfterMs: this._retryAfterMs(resp, attempt) });
    }
    throw await this._mapError(resp, p);
  }

  // Retry-After header (seconds) → ms, capped; exponential fallback when absent.
  _retryAfterMs(resp, attempt = 0) {
    const h = resp.headers, ra = h && typeof h.get === 'function' ? h.get('Retry-After') : null;
    const s = ra != null && ra !== '' ? parseFloat(ra) : NaN;
    const ms = Number.isFinite(s) ? s * 1000 : 1000 * 2 ** attempt;
    return Math.min(ms, this._maxBackoffMs);
  }

  // JSON-RPC endpoints (api.dropboxapi.com/2/*).
  async _rpc(endpoint, arg, p) {
    const resp = await this._send(async () => {
      const headers = { Authorization: await this._authHeader() };
      let body;
      if (arg !== undefined && arg !== null) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(arg); }
      return fetch(API + endpoint, { method: 'POST', headers, body });
    }, p);
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  // Content endpoints (content.dropboxapi.com/2/*) — arg rides the Dropbox-API-Arg HEADER, which
  // must be a valid HTTP header value (ASCII). Non-ASCII (accented/unicode paths) MUST be escaped
  // as \uXXXX — exactly what the Dropbox SDK's httpHeaderSafeJson does. Without this, a unicode
  // path yields a malformed header → the request fails, and since the error response omits the CORS
  // header it surfaces as a bogus "No Access-Control-Allow-Origin" — breaking upload AND download
  // for any such path. (RPC args ride the JSON body, which carries unicode fine, so this is content-only.)
  _apiArg(arg) {
    const s = JSON.stringify(arg); let o = '';
    for (let i = 0; i < s.length; i++) { const cc = s.charCodeAt(i); o += cc > 127 ? String.fromCharCode(92) + 'u' + cc.toString(16).padStart(4, '0') : s[i]; }
    return o;
  }

  async _content(endpoint, arg, p, opts = {}) {
    return this._send(async () => {
      const headers = { Authorization: await this._authHeader(), 'Dropbox-API-Arg': this._apiArg(arg) };
      if (opts.contentType) headers['Content-Type'] = opts.contentType;
      return fetch(CONTENT + endpoint, { method: 'POST', headers, body: opts.body });
    }, p);
  }

  // Dropbox 409s carry a (possibly nested) error['.tag']; map to vfsError codes. (401/429/503
  // are handled in _send; this is the terminal mapper for everything else.)
  async _mapError(resp, p) {
    if (resp.status === 401) return vfsError('EACCES', p, 'dropbox token rejected');
    let raw = '';
    try { raw = await resp.text(); } catch { /* */ }
    let summary = raw, tagChain = raw;
    try {
      const j = JSON.parse(raw);
      summary = j.error_summary || raw;
      tagChain = JSON.stringify(j.error != null ? j.error : raw);
    } catch { /* not JSON */ }
    if (/not_found/.test(tagChain)) return vfsError('ENOENT', p);
    if (/conflict/.test(tagChain)) return vfsError('EEXIST', p);
    return new VFSError('EIO', p, `dropbox: ${summary || resp.status}`);
  }

  async init() {
    // No-op. The token is exercised on the first real call; nothing to validate eagerly.
  }

  async readFile(p, encoding) {
    const resp = await this._content('files/download', { path: this._dpath(p) }, p);
    if (encoding === 'bytes') return new Uint8Array(await resp.arrayBuffer());
    return await resp.text();
  }

  async writeFile(p, content) {
    await this._content(
      'files/upload',
      { path: this._dpath(p), mode: 'overwrite', mute: true },
      p,
      { body: content, contentType: 'application/octet-stream' },
    );
  }

  // Bulk write — commit many files in FEW write operations via upload_session + finish_batch,
  // far gentler on Dropbox's per-namespace write lock than N files/upload calls. The single
  // writeFile stays for one-offs. Chunks at 1,000 entries (the batch limit).
  async writeFiles(files) {
    if (!files || !files.length) return { committed: 0 };
    let committed = 0;
    for (let i = 0; i < files.length; i += 1000) {
      const chunk = files.slice(i, i + 1000);
      // each file is a one-shot upload session (close:true); these are content uploads (modest
      // concurrency ok) — they don't contend on the commit lock the way files/upload does.
      const sessions = await this._mapLimit(chunk, this._uploadConc, async (f) => {
        const resp = await this._content('files/upload_session/start', { close: true }, f.path, { body: f.content, contentType: 'application/octet-stream' });
        const j = JSON.parse(await resp.text());
        return { session_id: j.session_id, offset: this._byteLen(f.content), path: f.path };
      });
      const entries = sessions.map((s) => ({ cursor: { session_id: s.session_id, offset: s.offset }, commit: { path: this._dpath(s.path), mode: 'overwrite', mute: true } }));
      this._assertBatch(await this._finishBatch(entries), sessions);
      committed += sessions.length;
    }
    return { committed };
  }

  // finish_batch may complete synchronously or hand back an async_job_id to poll via check.
  async _finishBatch(entries) {
    let res = await this._rpc('files/upload_session/finish_batch', { entries }, '/');
    let job = res && res['.tag'] === 'async_job_id' ? res.async_job_id : null;
    while (job) {
      await this._sleep(this._batchPollMs);
      res = await this._rpc('files/upload_session/finish_batch/check', { async_job_id: job }, '/');
      if (res && res['.tag'] === 'complete') job = null;   // else in_progress → keep polling
    }
    return res;   // { '.tag':'complete', entries:[…] }
  }

  // A completed batch lists a per-entry .tag; surface any non-'success' as EIO with the paths.
  _assertBatch(result, sessions) {
    const entries = (result && result.entries) || [];
    const failed = [];
    entries.forEach((e, i) => { if (e && e['.tag'] && e['.tag'] !== 'success') failed.push(sessions[i] ? sessions[i].path : String(i)); });
    if (failed.length) throw new VFSError('EIO', failed[0], `dropbox: ${failed.length} file(s) failed to commit`, { failed });
  }

  async stat(p) {
    const dp = this._dpath(p);
    // get_metadata rejects '' — the (app/subtree) root is always a directory.
    if (dp === '') return { type: 'directory', size: 0 };
    const m = await this._rpc('files/get_metadata', { path: dp }, p);
    if (m['.tag'] === 'folder') {
      return { type: 'directory', size: 0, modified: new Date(), created: new Date() };
    }
    const modified = m.server_modified ? new Date(m.server_modified) : new Date();
    return {
      type: 'file',
      size: m.size || 0,
      contentHash: m.content_hash,   // Dropbox's byte hash → consumers skip re-downloading identical files
      modified,
      created: m.client_modified ? new Date(m.client_modified) : modified,
    };
  }

  async readdir(p) {
    let res = await this._rpc('files/list_folder', { path: this._dpath(p) }, p);
    const names = res.entries.map((e) => e.name);
    while (res.has_more) {
      res = await this._rpc('files/list_folder/continue', { cursor: res.cursor }, p);
      for (const e of res.entries) names.push(e.name);
    }
    return names;
  }

  // One paginated sweep of a whole subtree (list_folder recursive) → RICH entries (so the caller
  // never needs a per-file stat) PLUS the cursor (valid for changes() — go straight to incremental
  // afterward, no separate get_latest_cursor). Replaces a readdir+per-file-stat walk: minutes → ~1 call.
  async listTree(p) {
    let res;
    try {
      res = await this._rpc('files/list_folder', { path: this._dpath(p), recursive: true }, p);
    } catch (e) {
      if (e && e.code === 'ENOENT') return { entries: [], cursor: '' };   // empty/missing root → empty, don't throw
      throw e;
    }
    const entries = [];
    const take = (list) => { for (const e of list) { const m = this._mapEntry(e); if (m) entries.push(m); } };
    take(res.entries);
    while (res.has_more) {
      res = await this._rpc('files/list_folder/continue', { cursor: res.cursor }, p);
      take(res.entries);
    }
    return { entries, cursor: res.cursor };
  }

  // a list_folder entry → a normalized VFS entry (paths root-stripped); null for deletions/unknown tags.
  _mapEntry(e) {
    const path = this._vpath(e.path_display || e.path_lower || ('/' + (e.name || '')));
    if (e['.tag'] === 'folder') return { path, type: 'directory' };
    if (e['.tag'] === 'file') return { path, type: 'file', size: e.size || 0, contentHash: e.content_hash, modified: e.server_modified ? new Date(e.server_modified) : undefined };
    return null;
  }

  async mkdir(p) {
    // Conflict → _mapError yields EEXIST, which base.import / _cpRecursive tolerate.
    await this._rpc('files/create_folder_v2', { path: this._dpath(p) }, p);
  }

  // delete_v2 handles both files and folders.
  async unlink(p) { await this._rpc('files/delete_v2', { path: this._dpath(p) }, p); }
  async rmdir(p) { await this._rpc('files/delete_v2', { path: this._dpath(p) }, p); }

  // Bulk delete via delete_batch (few ops vs N delete_v2). Chunks at 1,000; polls check if async.
  async deleteBatch(paths) {
    if (!paths || !paths.length) return { deleted: 0 };
    let deleted = 0;
    for (let i = 0; i < paths.length; i += 1000) {
      const chunk = paths.slice(i, i + 1000);
      let res = await this._rpc('files/delete_batch', { entries: chunk.map((pp) => ({ path: this._dpath(pp) })) }, '/');
      let job = res && res['.tag'] === 'async_job_id' ? res.async_job_id : null;
      while (job) {
        await this._sleep(this._batchPollMs);
        res = await this._rpc('files/delete_batch/check', { async_job_id: job }, '/');
        if (res && res['.tag'] === 'complete') job = null;
      }
      deleted += chunk.length;
    }
    return { deleted };
  }

  // Real server-side move (atomic — unlike RESTBackend's GET→PUT→DELETE).
  async rename(oldP, newP) {
    await this._rpc('files/move_v2', { from_path: this._dpath(oldP), to_path: this._dpath(newP) }, oldP);
  }

  // ── Change feed (for a sync engine's pull) — keeps all Dropbox-API knowledge here. ──
  async latestCursor() {
    const res = await this._rpc('files/list_folder/get_latest_cursor', { path: this._root || '', recursive: true }, '/');
    return res.cursor;
  }

  // Raw entries (each carries .tag / path_display / content_hash) — the sync's incremental pull
  // reads content_hash to suppress re-downloading bytes it already has.
  async changes(cursor) {
    const res = await this._rpc('files/list_folder/continue', { cursor }, '/');
    return { entries: res.entries, cursor: res.cursor, has_more: res.has_more };
  }

  async longpoll(cursor, timeout = 30) {
    // The longpoll endpoint is UNauthenticated by design — send no Authorization header.
    const resp = await fetch(NOTIFY + 'files/list_folder/longpoll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor, timeout }),
    });
    if (!resp.ok) throw await this._mapError(resp, '/');
    const j = await resp.json();
    return { changes: !!j.changes };
  }

  // bounded-concurrency map (uploads fan out without re-implementing politeness per caller).
  async _mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let idx = 0;
    const n = Math.max(1, Math.min(limit, items.length));
    const worker = async () => { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); } };
    await Promise.all(Array.from({ length: n }, worker));
    return out;
  }

  // byte length of a write payload (string / typed-array / ArrayBuffer) for the session offset.
  _byteLen(c) {
    if (c == null) return 0;
    if (typeof c === 'string') return new TextEncoder().encode(c).length;
    if (ArrayBuffer.isView(c)) return c.byteLength;
    if (c instanceof ArrayBuffer) return c.byteLength;
    return 0;
  }

  get persistent() { return true; }
}

// -- abus.js --

// An A-Bus-proxy VFS backend. Forwards every operation to a remote VFS
// service (the Auditable Works `works` service) over an A-Bus connection.
//
// Duck-typed on the bus handle: it only ever calls `bus.call(address, args)`,
// so @gcu/vfs takes no dependency on @gcu/abus — any object with a matching
// `.call()` works.
//
//   new AbusBackend({ bus, service: 'works', root: '' })
//
// `root` is prepended to every path before the remote call, so the backend
// can be mounted at one VFS path while addressing a different subtree of the
// remote filesystem (mount at /projects/self, root '/projects/<realname>').
class AbusBackend extends Backend {
  static type = 'abus';

  constructor(config) {
    super();
    this._bus = config.bus;
    this._service = config.service || 'works';
    this._root = config.root || '';
  }

  // Mount-relative path (leading slash) → remote workspace path.
  _remote(p) {
    return this._root + p;
  }

  _call(member, args) {
    return this._bus.call(
      { to: this._service, path: '/', interface: 'VFS', member },
      args);
  }

  async readFile(p, encoding) {
    return this._call('Read', [this._remote(p), encoding]);
  }

  async writeFile(p, content) {
    await this._call('Write', [this._remote(p), content]);
  }

  async readdir(p) {
    return this._call('List', [this._remote(p)]);
  }

  async stat(p) {
    return this._call('Stat', [this._remote(p)]);
  }

  // Use the service's Exists directly — avoids depending on ENOENT error
  // codes surviving the A-Bus round-trip (the base Backend.exists would).
  async exists(p) {
    return this._call('Exists', [this._remote(p)]);
  }

  async mkdir(p) {
    await this._call('MkDir', [this._remote(p)]);
  }

  async unlink(p) {
    await this._call('Delete', [this._remote(p)]);
  }

  async rmdir(p) {
    await this._call('Delete', [this._remote(p)]);
  }

  async rename(oldP, newP) {
    await this._call('Move', [this._remote(oldP), this._remote(newP)]);
  }

  get persistent() { return true; }
}

// -- overlay.js --

const WHITEOUT_PATH = '/.vfs_whiteouts';

class OverlayBackend extends Backend {
  static type = 'overlay';

  constructor(config) {
    super();
    this._lowerConfig = config && config.lower;
    this._upperConfig = config && config.upper;
    this._lower = null;
    this._upper = null;
    this._whiteouts = new Set();
  }

  async init() {
    this._lower = _createBackend(this._lowerConfig);
    this._upper = _createBackend(this._upperConfig);
    if (this._lower.init) await this._lower.init();
    if (this._upper.init) await this._upper.init();
    // Load persisted whiteouts
    try {
      const data = await this._upper.readFile(WHITEOUT_PATH);
      const arr = JSON.parse(data);
      this._whiteouts = new Set(arr);
    } catch {
      // No whiteouts yet
    }
  }

  async _persistWhiteouts() {
    await this._upper.writeFile(WHITEOUT_PATH, JSON.stringify([...this._whiteouts]));
  }

  _isWhiteout(p) {
    return this._whiteouts.has(path.normalize(p));
  }

  async readFile(p, encoding) {
    const n = path.normalize(p);
    if (this._isWhiteout(n)) throw vfsError('ENOENT', p);
    try {
      return await this._upper.readFile(n, encoding);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      return await this._lower.readFile(n, encoding);
    }
  }

  async writeFile(p, content) {
    const n = path.normalize(p);
    // Remove whiteout if present
    if (this._whiteouts.delete(n)) {
      await this._persistWhiteouts();
    }
    await this._upper.writeFile(n, content);
  }

  async stat(p) {
    const n = path.normalize(p);
    if (this._isWhiteout(n)) throw vfsError('ENOENT', p);
    try {
      const s = await this._upper.stat(n);
      return { ...s, layer: 'upper' };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const s = await this._lower.stat(n);
      return { ...s, layer: 'lower' };
    }
  }

  async mkdir(p, opts) {
    const n = path.normalize(p);
    if (this._whiteouts.delete(n)) {
      await this._persistWhiteouts();
    }
    await this._upper.mkdir(n, opts);
  }

  async readdir(p) {
    const n = path.normalize(p);
    if (this._isWhiteout(n)) throw vfsError('ENOENT', p);
    const names = new Set();
    // Collect from upper
    try {
      const upper = await this._upper.readdir(n);
      for (const name of upper) {
        if (name !== path.basename(WHITEOUT_PATH)) names.add(name);
      }
    } catch {
      // upper may not have this dir
    }
    // Collect from lower
    try {
      const lower = await this._lower.readdir(n);
      for (const name of lower) names.add(name);
    } catch {
      // lower may not have this dir
    }
    // Filter whiteouts
    const prefix = n === '/' ? '/' : n + '/';
    for (const name of names) {
      if (this._whiteouts.has(prefix + name)) names.delete(name);
    }
    return [...names].sort();
  }

  async unlink(p) {
    const n = path.normalize(p);
    // Check if in lower
    let inLower = false;
    try { await this._lower.stat(n); inLower = true; } catch {}
    // Try to delete from upper
    try { await this._upper.unlink(n); } catch {}
    // If in lower, add whiteout
    if (inLower) {
      this._whiteouts.add(n);
      await this._persistWhiteouts();
    }
  }

  async rmdir(p) {
    const n = path.normalize(p);
    let inLower = false;
    try { await this._lower.stat(n); inLower = true; } catch {}
    try { await this._upper.rmdir(n); } catch {}
    if (inLower) {
      this._whiteouts.add(n);
      await this._persistWhiteouts();
    }
  }

  async rename(oldP, newP) {
    const content = await this.readFile(oldP, 'bytes');
    await this.writeFile(newP, content);
    await this.unlink(oldP);
  }

  async touch(p) {
    const n = path.normalize(p);
    try {
      await this.stat(n);
      // Exists — read and rewrite to upper to update mtime
      const content = await this.readFile(n, 'bytes');
      await this.writeFile(n, content);
    } catch (e) {
      if (e.code === 'ENOENT') {
        await this.writeFile(n, '');
      } else throw e;
    }
  }

  async exists(p) {
    const n = path.normalize(p);
    if (this._isWhiteout(n)) return false;
    try { await this.stat(n); return true; }
    catch { return false; }
  }

  async reset(p) {
    if (p) {
      const n = path.normalize(p);
      // Clear whiteouts under prefix
      for (const w of this._whiteouts) {
        if (w === n || w.startsWith(n === '/' ? '/' : n + '/')) {
          this._whiteouts.delete(w);
        }
      }
      // Delete from upper
      try {
        const info = await this._upper.stat(n);
        if (info.type === 'directory') {
          await this._rmUpperRecursive(n);
        } else {
          await this._upper.unlink(n);
        }
      } catch {}
    } else {
      this._whiteouts.clear();
      // Clear all upper content (except whiteout file)
      try {
        const entries = await this._upper.readdir('/');
        for (const name of entries) {
          const child = '/' + name;
          try {
            const info = await this._upper.stat(child);
            if (info.type === 'directory') {
              await this._rmUpperRecursive(child);
            } else {
              await this._upper.unlink(child);
            }
          } catch {}
        }
      } catch {}
    }
    await this._persistWhiteouts();
  }

  async _rmUpperRecursive(p) {
    try {
      const entries = await this._upper.readdir(p);
      for (const name of entries) {
        const child = p === '/' ? '/' + name : p + '/' + name;
        const info = await this._upper.stat(child);
        if (info.type === 'directory') {
          await this._rmUpperRecursive(child);
        } else {
          await this._upper.unlink(child);
        }
      }
      await this._upper.rmdir(p);
    } catch {}
  }

  async destroy() {
    if (this._lower && this._lower.destroy) await this._lower.destroy();
    if (this._upper && this._upper.destroy) await this._upper.destroy();
  }

  get persistent() { return !!this._upper && !!this._upper.persistent; }
  get readonly() { return !!this._upper && !!this._upper.readonly; }
}

// -- cache.js --

const META_PREFIX = '/_cache_meta';
const LISTING_PREFIX = '/_cache_listing';

class CacheBackend extends Backend {
  static type = 'cache';

  constructor(config) {
    super();
    this._remoteConfig = config && config.backend;
    this._storeConfig = config && config.store;
    this._ttl = (config && config.ttl) || 60000; // default 1 minute
    this._listingTtl = (config && config.listingTtl) || this._ttl;
    this._remote = null;
    this._store = null;
  }

  async init() {
    this._remote = _createBackend(this._remoteConfig);
    this._store = _createBackend(this._storeConfig || { type: 'memory' });
    if (this._remote.init) await this._remote.init();
    if (this._store.init) await this._store.init();
    // Expose the remote's optimized API through the cache mount ONLY when the remote actually implements it —
    // otherwise the method stays absent and the router's generic fallback applies. Bulk writes/deletes
    // invalidate the touched cache entries; listTree + the change feed pass straight through.
    if (typeof this._remote.writeFiles === 'function') {
      this.writeFiles = async (files) => { const r = await this._remote.writeFiles(files); for (const f of files) await this.invalidate(path.normalize(f.path)); return r; };
    }
    if (typeof this._remote.deleteBatch === 'function') {
      this.deleteBatch = async (paths) => { const r = await this._remote.deleteBatch(paths); for (const p of paths) await this.invalidate(path.normalize(p)); return r; };
    }
    for (const m of ['listTree', 'latestCursor', 'changes', 'longpoll']) {
      if (typeof this._remote[m] === 'function') this[m] = (...a) => this._remote[m](...a);
    }
  }

  async _isFresh(metaPath, ttl) {
    try {
      const raw = await this._store.readFile(metaPath);
      const meta = JSON.parse(raw);
      return (Date.now() - meta.ts) < ttl;
    } catch {
      return false;
    }
  }

  async _setMeta(metaPath, extra) {
    const meta = { ts: Date.now(), ...extra };
    // Ensure parent dirs exist
    const dir = path.dirname(metaPath);
    try { await this._store.mkdir(dir, { recursive: true }); } catch {}
    await this._store.writeFile(metaPath, JSON.stringify(meta));
  }

  async readFile(p, encoding) {
    const n = path.normalize(p);
    const metaPath = META_PREFIX + n;
    if (await this._isFresh(metaPath, this._ttl)) {
      try {
        return await this._store.readFile(n, encoding);
      } catch {
        // Cache entry missing, fall through to remote
      }
    }
    // Fetch from remote
    const content = await this._remote.readFile(n, encoding);
    // Cache it
    try {
      const dir = path.dirname(n);
      try { await this._store.mkdir(dir, { recursive: true }); } catch {}
      await this._store.writeFile(n, content);
      await this._setMeta(metaPath);
    } catch {}
    return content;
  }

  async writeFile(p, content) {
    const n = path.normalize(p);
    // Write-through: remote first
    await this._remote.writeFile(n, content);
    // Update cache
    try {
      const dir = path.dirname(n);
      try { await this._store.mkdir(dir, { recursive: true }); } catch {}
      await this._store.writeFile(n, content);
      await this._setMeta(META_PREFIX + n);
    } catch {}
  }

  async stat(p) {
    const n = path.normalize(p);
    const metaPath = META_PREFIX + n;
    if (await this._isFresh(metaPath, this._ttl)) {
      try {
        const raw = await this._store.readFile(metaPath);
        const meta = JSON.parse(raw);
        if (meta.stat) return meta.stat;
      } catch {}
    }
    const s = await this._remote.stat(n);
    try { await this._setMeta(metaPath, { stat: s }); } catch {}
    return s;
  }

  async readdir(p) {
    const n = path.normalize(p);
    const listPath = LISTING_PREFIX + n;
    try {
      const raw = await this._store.readFile(listPath);
      const listing = JSON.parse(raw);
      if ((Date.now() - listing.ts) < this._listingTtl) {
        return listing.entries;
      }
    } catch {}
    const entries = await this._remote.readdir(n);
    try {
      const dir = path.dirname(listPath);
      try { await this._store.mkdir(dir, { recursive: true }); } catch {}
      await this._store.writeFile(listPath, JSON.stringify({ ts: Date.now(), entries }));
    } catch {}
    return entries;
  }

  async mkdir(p, opts) {
    return this._remote.mkdir(p, opts);
  }

  async unlink(p) {
    const n = path.normalize(p);
    await this._remote.unlink(n);
    await this.invalidate(n);
  }

  async rmdir(p, opts) {
    const n = path.normalize(p);
    await this._remote.rmdir(n, opts);                                  // pass opts → native recursive on the remote
    if (opts && opts.recursive) await this._invalidateSubtree(n);       // drop cached descendants too
    else await this.invalidate(n);
  }

  async rename(oldP, newP) {
    await this._remote.rename(oldP, newP);
    await this.invalidate(path.normalize(oldP));
    await this.invalidate(path.normalize(newP));
  }

  async touch(p) {
    return this._remote.touch(p);
  }

  async invalidate(p) {
    if (p === '*') {
      // Clear entire cache store
      try {
        const entries = await this._store.readdir('/');
        for (const name of entries) {
          const child = '/' + name;
          try {
            const info = await this._store.stat(child);
            if (info.type === 'directory') {
              await this._rmStoreRecursive(child);
            } else {
              await this._store.unlink(child);
            }
          } catch {}
        }
      } catch {}
      return;
    }
    const n = path.normalize(p);
    // Remove cached content
    try { await this._store.unlink(n); } catch {}
    // Remove meta
    try { await this._store.unlink(META_PREFIX + n); } catch {}
    // Remove listing
    try { await this._store.unlink(LISTING_PREFIX + n); } catch {}
  }

  async _rmStoreRecursive(p) {
    try {
      const entries = await this._store.readdir(p);
      for (const name of entries) {
        const child = p === '/' ? '/' + name : p + '/' + name;
        try {
          const info = await this._store.stat(child);
          if (info.type === 'directory') {
            await this._rmStoreRecursive(child);
          } else {
            await this._store.unlink(child);
          }
        } catch {}
      }
      await this._store.rmdir(p);
    } catch {}
  }

  // invalidate a whole cached subtree (content + meta + listing) — used after a recursive remote delete.
  async _invalidateSubtree(n) {
    await this.invalidate(n);
    for (const base of ['', META_PREFIX, LISTING_PREFIX]) {
      const root = base + n;
      try {
        const info = await this._store.stat(root);
        if (info.type === 'directory') await this._rmStoreRecursive(root);
        else await this._store.unlink(root);
      } catch {}
    }
  }

  async exists(p) {
    try { await this.stat(p); return true; }
    catch { return false; }
  }

  async destroy() {
    if (this._remote && this._remote.destroy) await this._remote.destroy();
    if (this._store && this._store.destroy) await this._store.destroy();
  }

  // Delegate capabilities to remote
  get persistent() { return this._remote ? !!this._remote.persistent : false; }
  get readonly() { return this._remote ? !!this._remote.readonly : false; }
  get streamable() { return this._remote ? !!this._remote.streamable : false; }
  get estimatable() { return this._remote ? !!this._remote.estimatable : false; }
  get recursiveRemove() { return this._remote ? !!this._remote.recursiveRemove : false; }
}

// -- glob.js --

function _globToRegex(pattern) {
  // Split pattern into segments
  const segments = pattern.split('/').filter(Boolean);
  let regexParts = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '**') {
      regexParts.push('(?:.+/)?');
    } else {
      // Escape regex chars except * and ?
      let part = '';
      for (const ch of seg) {
        if (ch === '*') part += '[^/]*';
        else if (ch === '?') part += '[^/]';
        else if ('.+^${}()|[]\\'.includes(ch)) part += '\\' + ch;
        else part += ch;
      }
      regexParts.push(part + '/');
    }
  }

  // Join and fix trailing slash
  let regex = '/' + regexParts.join('');
  // Remove trailing slash for the final match
  if (regex.endsWith('/')) regex = regex.slice(0, -1);

  return new RegExp('^' + regex + '$');
}

function _staticPrefix(pattern) {
  const segments = pattern.split('/').filter(Boolean);
  const prefix = [];
  for (const seg of segments) {
    if (seg === '**' || seg.includes('*') || seg.includes('?')) break;
    prefix.push(seg);
  }
  return '/' + prefix.join('/');
}

async function vfsGlob(vfs, pattern) {
  const normalized = path.normalize(pattern);
  const regex = _globToRegex(normalized);
  const prefix = _staticPrefix(normalized);

  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await vfs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = dir === '/' ? '/' + name : dir + '/' + name;
      if (regex.test(full)) results.push(full);
      // Recurse into directories if pattern has **
      try {
        const info = await vfs.stat(full);
        if (info.type === 'directory') {
          await walk(full);
        }
      } catch {
        // stat failed, skip
      }
    }
  }

  await walk(prefix === '/' ? '/' : prefix);
  return results.sort();
}

// -- permissions.js --

const READ_OPS = new Set(['read', 'readFile', 'readdir', 'stat', 'lstat', 'exists',
  'createReadStream', 'glob', 'du', 'export', 'readlink']);
const WRITE_OPS = new Set(['write', 'writeFile', 'mkdir', 'rmdir', 'unlink', 'rename',
  'cp', 'touch', 'chmod', 'chown', 'symlink', 'rm', 'import', 'createWriter', 'writeFrom']);

function checkPermission(operation, p, principal, meta) {
  // No principal → unrestricted
  if (!principal) return;

  const normalized = path.normalize(p);
  const isRead = READ_OPS.has(operation) || operation === 'read';
  const isWrite = WRITE_OPS.has(operation) || operation === 'write';

  // Prefix check
  if (principal.prefixes) {
    const matched = principal.prefixes.some(prefix => {
      const normPrefix = prefix.startsWith('/') ? prefix : '/' + prefix;
      return normalized === normPrefix || normalized.startsWith(normPrefix.endsWith('/') ? normPrefix : normPrefix + '/');
    });
    const readOnlyMatch = principal.readOnlyPrefixes && principal.readOnlyPrefixes.some(prefix => {
      const normPrefix = prefix.startsWith('/') ? prefix : '/' + prefix;
      return normalized === normPrefix || normalized.startsWith(normPrefix.endsWith('/') ? normPrefix : normPrefix + '/');
    });

    if (!matched && !readOnlyMatch) {
      throw vfsError('EACCES', p, 'path not in allowed prefixes');
    }

    // Read-only prefix check
    if (readOnlyMatch && !matched && isWrite) {
      throw vfsError('EACCES', p, 'read-only prefix');
    }
    // If only matched via readOnlyPrefixes, writes are denied
    if (readOnlyMatch && matched) {
      // Matched in both — regular prefix takes precedence (rw)
    } else if (readOnlyMatch && isWrite) {
      throw vfsError('EACCES', p, 'read-only prefix');
    }
  }

  // Mode bit check — agent is always "other"
  if (meta && meta.mode !== undefined) {
    const otherBits = meta.mode & 0o7;
    if (isRead && !(otherBits & 0o4)) {
      throw vfsError('EACCES', p, 'mode bits deny read');
    }
    if (isWrite && !(otherBits & 0o2)) {
      throw vfsError('EACCES', p, 'mode bits deny write');
    }
  }
}

// -- vfs.js --

const BACKEND_TYPES = {
  memory: MemoryBackend,
  idb: IDBBackend,
  comment: CommentBackend,
  opfs: OPFSBackend,
  fsaa: FSAABackend,
  fetch: FetchBackend,
  rest: RESTBackend,
  dropbox: DropboxBackend,
  overlay: OverlayBackend,
  cache: CacheBackend,
};

function _createBackend(config) {
  if (!config) return new MemoryBackend();
  if (config instanceof Backend) return config;
  // Plain object with methods — custom backend
  if (typeof config.readFile === 'function' || typeof config.stat === 'function') {
    return config;
  }
  const type = config.type || 'memory';
  const Cls = BACKEND_TYPES[type];
  if (!Cls) throw new Error(`Unknown backend type: ${type}`);
  return new Cls(config);
}

class VFS extends EventEmitter {
  constructor() {
    super();
    this._mounts = new Map();
  }

  static async create(config) {
    const vfs = new VFS();
    if (!config) {
      // Default: memory at /
      const backend = new MemoryBackend();
      await backend.init();
      vfs._mounts.set('/', backend);
    } else if (config.type) {
      // Single backend shorthand
      const backend = _createBackend(config);
      if (backend.init) await backend.init();
      vfs._mounts.set('/', backend);
    } else if (config.backends) {
      for (const [mountPath, backendConfig] of Object.entries(config.backends)) {
        const backend = _createBackend(backendConfig);
        if (backend.init) await backend.init();
        vfs._mounts.set(path.normalize(mountPath), backend);
      }
    }
    return vfs;
  }

  resolve(p) {
    const normalized = path.normalize(p);
    let bestMount = '';
    let bestBackend = null;
    for (const [mount, backend] of this._mounts) {
      if (normalized === mount || normalized.startsWith(mount === '/' ? '/' : mount + '/') || mount === '/') {
        if (mount.length > bestMount.length) {
          bestMount = mount;
          bestBackend = backend;
        }
      }
    }
    if (!bestBackend) throw vfsError('ENOENT', p, 'no mount for path');
    const subpath = bestMount === '/'
      ? normalized
      : normalized.slice(bestMount.length) || '/';
    return { backend: bestBackend, subpath, mount: bestMount };
  }

  async mount(mountPath, config) {
    const normalized = path.normalize(mountPath);
    const backend = _createBackend(config);
    if (backend.init) await backend.init();
    this._mounts.set(normalized, backend);
    this.emit('mount', { path: normalized, type: backend.constructor?.type || config?.type || 'custom' });
  }

  async unmount(mountPath) {
    const normalized = path.normalize(mountPath);
    const backend = this._mounts.get(normalized);
    if (!backend) return;
    if (backend.destroy) await backend.destroy();
    this._mounts.delete(normalized);
    this.emit('unmount', { path: normalized });
  }

  mounts() {
    const result = [];
    for (const [mp, backend] of this._mounts) {
      result.push({ path: mp, type: backend.constructor?.type || 'custom' });
    }
    return result;
  }

  capabilities(p) {
    const { backend } = this.resolve(p);
    return {
      type: backend.constructor?.type || 'custom',
      persistent: !!backend.persistent,
      writable: !backend.readonly,
      streamable: !!backend.streamable,
      estimatable: !!backend.estimatable,
      nativeFile: !!backend.nativeFile,
      rangeReadable: !!backend.rangeReadable,
      exportable: backend.exportable !== false,
      portable: !!backend.portable,
      symlinks: !!backend.symlinks,
    };
  }

  _checkWrite(backend, p) {
    if (backend.readonly) throw vfsError('EACCES', p, 'read-only backend');
  }

  // --- Filesystem operations ---

  async readFile(p, encodingOrOpts) {
    const encoding = typeof encodingOrOpts === 'string' ? encodingOrOpts : undefined;
    const opts = typeof encodingOrOpts === 'object' ? encodingOrOpts : {};
    const principal = opts.principal;
    checkPermission('readFile', p, principal);
    const { backend, subpath } = this.resolve(p);
    if (principal) {
      try {
        const meta = await backend.stat(subpath);
        checkPermission('readFile', p, principal, meta);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    return backend.readFile(subpath, encoding || (opts.encoding));
  }

  async writeFile(p, content, opts) {
    const principal = opts?.principal;
    checkPermission('writeFile', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (principal) {
      try {
        const meta = await backend.stat(subpath);
        checkPermission('writeFile', p, principal, meta);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    await backend.writeFile(subpath, content);
    this.emit('write', { path: path.normalize(p) });
  }

  async mkdir(p, opts) {
    const principal = opts?.principal;
    checkPermission('mkdir', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    await backend.mkdir(subpath, opts);
    this.emit('mkdir', { path: path.normalize(p) });
  }

  async readdir(p, opts) {
    const principal = opts?.principal;
    checkPermission('readdir', p, principal);
    const { backend, subpath } = this.resolve(p);

    const entries = await backend.readdir(subpath);

    // Check for child mounts — add their mount-point names
    const normalized = path.normalize(p);
    const childNames = new Set(entries);
    for (const [mount] of this._mounts) {
      if (mount === '/') continue;
      const parent = path.dirname(mount);
      if (parent === normalized) {
        childNames.add(path.basename(mount));
      }
    }

    const result = [...childNames].sort();

    if (opts && opts.stat) {
      const detailed = [];
      for (const name of result) {
        const childPath = normalized === '/' ? '/' + name : normalized + '/' + name;
        try {
          const info = await this.stat(childPath);
          detailed.push({ name, ...info });
        } catch {
          detailed.push({ name, type: 'unknown' });
        }
      }
      return detailed;
    }
    return result;
  }

  async stat(p, opts) {
    const principal = opts?.principal;
    checkPermission('stat', p, principal);
    const { backend, subpath } = this.resolve(p);
    return backend.stat(subpath);
  }

  async lstat(p, opts) {
    const principal = opts?.principal;
    checkPermission('lstat', p, principal);
    const { backend, subpath } = this.resolve(p);
    return backend.lstat(subpath);
  }

  async unlink(p, opts) {
    const principal = opts?.principal;
    checkPermission('unlink', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    await backend.unlink(subpath);
    this.emit('delete', { path: path.normalize(p) });
  }

  async rmdir(p, opts) {
    const principal = opts?.principal;
    checkPermission('rmdir', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    await backend.rmdir(subpath, opts);   // pass opts through (enables a backend's native recursive path)
    this.emit('delete', { path: path.normalize(p) });
  }

  async rm(p, opts) {
    const principal = opts?.principal;
    checkPermission('rm', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (opts && opts.recursive) {
      if (backend.recursiveRemove) {
        // one native op (the backend handles file-or-subtree) instead of walking the tree node-by-node
        await backend.rmdir(subpath, { recursive: true });
        this.emit('delete', { path: path.normalize(p) });   // one coarse event on the fast path
      } else {
        await this._rmRecursive(p, backend, subpath);
      }
    } else {
      const info = await backend.stat(subpath);
      if (info.type === 'directory') throw vfsError('EISDIR', p);
      await backend.unlink(subpath);
      this.emit('delete', { path: path.normalize(p) });
    }
  }

  async _rmRecursive(absPath, backend, subpath) {
    const info = await backend.stat(subpath);
    if (info.type === 'directory') {
      const entries = await backend.readdir(subpath);
      for (const name of entries) {
        const childSub = subpath === '/' ? '/' + name : subpath + '/' + name;
        const childAbs = absPath === '/' ? '/' + name : absPath + '/' + name;
        await this._rmRecursive(childAbs, backend, childSub);
      }
      await backend.rmdir(subpath);
    } else {
      await backend.unlink(subpath);
    }
    this.emit('delete', { path: path.normalize(absPath) });
  }

  async rename(oldP, newP, opts) {
    const principal = opts?.principal;
    checkPermission('rename', oldP, principal);
    checkPermission('rename', newP, principal);
    const src = this.resolve(oldP);
    const dst = this.resolve(newP);

    if (src.backend === dst.backend) {
      this._checkWrite(src.backend, oldP);
      await src.backend.rename(src.subpath, dst.subpath);
      this.emit('rename', { oldPath: path.normalize(oldP), newPath: path.normalize(newP) });
    } else {
      // Cross-mount: copy + delete (not atomic — emit write + delete, not rename)
      this._checkWrite(dst.backend, newP);
      this._checkWrite(src.backend, oldP);
      const info = await src.backend.stat(src.subpath);
      if (info.type === 'directory') {
        await this._crossMountCpRecursive(src.backend, src.subpath, dst.backend, dst.subpath);
        await this._rmRecursiveBackend(src.backend, src.subpath);
      } else {
        const content = await src.backend.readFile(src.subpath, 'bytes');
        await dst.backend.writeFile(dst.subpath, content);
        await src.backend.unlink(src.subpath);
      }
      this.emit('write', { path: path.normalize(newP) });
      this.emit('delete', { path: path.normalize(oldP) });
    }
  }

  async _crossMountCpRecursive(srcBackend, srcPath, dstBackend, dstPath) {
    try { await dstBackend.mkdir(dstPath); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const entries = await srcBackend.readdir(srcPath);
    for (const name of entries) {
      const srcChild = srcPath === '/' ? '/' + name : srcPath + '/' + name;
      const dstChild = dstPath === '/' ? '/' + name : dstPath + '/' + name;
      const info = await srcBackend.stat(srcChild);
      if (info.type === 'directory') {
        await this._crossMountCpRecursive(srcBackend, srcChild, dstBackend, dstChild);
      } else {
        const content = await srcBackend.readFile(srcChild, 'bytes');
        await dstBackend.writeFile(dstChild, content);
      }
    }
  }

  async _rmRecursiveBackend(backend, subpath) {
    const info = await backend.stat(subpath);
    if (info.type === 'directory') {
      const entries = await backend.readdir(subpath);
      for (const name of entries) {
        await this._rmRecursiveBackend(backend, subpath === '/' ? '/' + name : subpath + '/' + name);
      }
      await backend.rmdir(subpath);
    } else {
      await backend.unlink(subpath);
    }
  }

  async exists(p, opts) {
    try { await this.stat(p, opts); return true; }
    catch { return false; }
  }

  async touch(p, opts) {
    const principal = opts?.principal;
    checkPermission('touch', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    await backend.touch(subpath);
    this.emit('write', { path: path.normalize(p) });
  }

  async cp(src, dst, opts) {
    const principal = opts?.principal;
    checkPermission('readFile', src, principal);
    checkPermission('writeFile', dst, principal);
    const srcR = this.resolve(src);
    const dstR = this.resolve(dst);
    this._checkWrite(dstR.backend, dst);

    if (srcR.backend === dstR.backend) {
      await srcR.backend.cp(srcR.subpath, dstR.subpath, opts);
    } else {
      const info = await srcR.backend.stat(srcR.subpath);
      if (info.type === 'directory') {
        if (!opts || !opts.recursive) throw vfsError('EISDIR', src);
        await this._crossMountCpRecursive(srcR.backend, srcR.subpath, dstR.backend, dstR.subpath);
      } else {
        const content = await srcR.backend.readFile(srcR.subpath, 'bytes');
        await dstR.backend.writeFile(dstR.subpath, content);
      }
    }
    this.emit('write', { path: path.normalize(dst) });
  }

  async symlink(target, p, opts) {
    const principal = opts?.principal;
    checkPermission('symlink', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (!backend.symlinks) throw vfsError('ENOTSUP', p, 'backend does not support symlinks');
    await backend.symlink(target, subpath);
    this.emit('write', { path: path.normalize(p) });
  }

  async readlink(p, opts) {
    const principal = opts?.principal;
    checkPermission('readlink', p, principal);
    const { backend, subpath } = this.resolve(p);
    if (!backend.symlinks) throw vfsError('ENOTSUP', p, 'backend does not support symlinks');
    return backend.readlink(subpath);
  }

  async chmod(p, mode, opts) {
    const principal = opts?.principal;
    checkPermission('chmod', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (!backend.chmod) throw vfsError('ENOTSUP', p);
    await backend.chmod(subpath, mode);
  }

  async chown(p, owner, group, opts) {
    const principal = opts?.principal;
    checkPermission('chown', p, principal);
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (!backend.chown) throw vfsError('ENOTSUP', p);
    await backend.chown(subpath, owner, group);
  }

  async glob(pattern, opts) {
    return vfsGlob(this, pattern);
  }

  async du(p) {
    let files = 0, directories = 0, bytes = 0;
    const walk = async (dir) => {
      const entries = await this.readdir(dir);
      for (const name of entries) {
        const full = dir === '/' ? '/' + name : dir + '/' + name;
        const info = await this.stat(full);
        if (info.type === 'directory') {
          directories++;
          await walk(full);
        } else {
          files++;
          bytes += info.size || 0;
        }
      }
    };
    // Check if p is a directory
    const info = await this.stat(p);
    if (info.type === 'directory') {
      directories++;
      await walk(p);
    } else {
      files = 1;
      bytes = info.size || 0;
    }
    return { files, directories, bytes };
  }

  async estimate(p) {
    const { backend } = this.resolve(p);
    if (backend.estimate) return backend.estimate();
    return { used: 0, available: Infinity };
  }

  async export(p) {
    const { backend, subpath } = this.resolve(p);
    if (!backend.export) throw vfsError('ENOTSUP', p);
    return backend.export(subpath);
  }

  async import(p, data) {
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    if (!backend.import) throw vfsError('ENOTSUP', p);
    await backend.import(subpath, data);
    this.emit('write', { path: path.normalize(p) });
  }

  createReadStream(p, opts) {
    const { backend, subpath } = this.resolve(p);
    return backend.createReadStream(subpath, opts);
  }

  // Resolve a path to a native `File` without decoding — the streaming escape
  // hatch (vfs = phonebook, the consumer owns the pipe). `capabilities(p).nativeFile`
  // tells you whether it's lazy (FSAA/OPFS) or a wrap-of-resident-bytes fallback.
  async toFile(p, opts) {
    checkPermission('readFile', p, opts?.principal);
    const { backend, subpath } = this.resolve(p);
    return backend.toFile(subpath);
  }

  // The backend-native handle (FSAA `FileSystemFileHandle`), or null.
  async resolveHandle(p, opts) {
    checkPermission('readFile', p, opts?.principal);
    const { backend, subpath } = this.resolve(p);
    return backend.resolveHandle ? backend.resolveHandle(subpath) : null;
  }

  // Read a byte range without reading the whole file. null where the backend
  // can't seek (check `capabilities(p).rangeReadable`).
  async readRange(p, offset, length, opts) {
    checkPermission('readFile', p, opts?.principal);
    const { backend, subpath } = this.resolve(p);
    return backend.readRange ? backend.readRange(subpath, offset, length) : null;
  }

  // Assert this path can be read WITHOUT buffering the whole file — a forward
  // stream OR a lazy native File. The "this huge file must never be fully read —
  // fail loud, don't silently OOM" guard (spec §3): a consumer calls it before
  // committing a multi-GB file to a mount / entering its hot path. Throws ENOTSUP
  // (with the mount + type) otherwise; returns the capabilities on success.
  requireStreamable(p) {
    const { backend, mount } = this.resolve(p);
    if (!(backend.streamable || backend.nativeFile)) {
      throw vfsError('ENOTSUP', p, `mount '${mount}' (${backend.constructor?.type || 'custom'}) can't stream — reading would buffer the whole file`);
    }
    return this.capabilities(p);
  }

  async createWriter(p, opts) {
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    return backend.createWriter(subpath, opts);
  }

  async writeFrom(p, iterable) {
    const { backend, subpath } = this.resolve(p);
    this._checkWrite(backend, p);
    const writer = backend.createWriter?.(subpath);
    if (writer) {
      // AWAIT each write — the sink's promise reflects readiness (FSAA's
      // FileSystemWritableFileStream is backpressured). Fire-and-forget here
      // would re-introduce OOM on the write side for a multi-GB export (spec §4).
      for await (const chunk of iterable) await writer.write(chunk);
      await writer.close();
    } else {
      // Fallback: collect and writeFile
      const chunks = [];
      for await (const chunk of iterable) chunks.push(chunk);
      if (chunks.length === 0) {
        await backend.writeFile(subpath, '');
      } else if (typeof chunks[0] === 'string') {
        await backend.writeFile(subpath, chunks.join(''));
      } else {
        // Concatenate Uint8Arrays
        const total = chunks.reduce((s, c) => s + c.byteLength, 0);
        const result = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) { result.set(c, offset); offset += c.byteLength; }
        await backend.writeFile(subpath, result);
      }
    }
    this.emit('write', { path: path.normalize(p) });
  }

  // --- extended/optimized backend API: delegate to the backend's fast path when present, else a generic
  //     fallback in core ops — so the method always works, fast where the backend (and composers) support it. ---

  // Bulk write — files grouped by mount; each backend gets one writeFiles() call (or a per-file fallback).
  async writeFiles(files, opts) {
    if (!files || !files.length) return { committed: 0 };
    const principal = opts?.principal;
    const groups = new Map();   // backend → [{ subpath, content, absPath }]
    for (const f of files) {
      checkPermission('writeFile', f.path, principal);
      const { backend, subpath } = this.resolve(f.path);
      this._checkWrite(backend, f.path);
      if (!groups.has(backend)) groups.set(backend, []);
      groups.get(backend).push({ subpath, content: f.content, absPath: f.path });
    }
    let committed = 0;
    for (const [backend, items] of groups) {
      if (typeof backend.writeFiles === 'function') {
        const r = await backend.writeFiles(items.map((i) => ({ path: i.subpath, content: i.content })));
        committed += (r && r.committed != null) ? r.committed : items.length;
      } else {
        for (const i of items) await backend.writeFile(i.subpath, i.content);
        committed += items.length;
      }
      for (const i of items) this.emit('write', { path: path.normalize(i.absPath) });
    }
    return { committed };
  }

  // Bulk delete — grouped by mount; each backend gets one deleteBatch() (or per-path unlink fallback).
  async deleteBatch(paths, opts) {
    if (!paths || !paths.length) return { deleted: 0 };
    const principal = opts?.principal;
    const groups = new Map();
    for (const p of paths) {
      checkPermission('rm', p, principal);
      const { backend, subpath } = this.resolve(p);
      this._checkWrite(backend, p);
      if (!groups.has(backend)) groups.set(backend, []);
      groups.get(backend).push({ subpath, absPath: p });
    }
    let deleted = 0;
    for (const [backend, items] of groups) {
      if (typeof backend.deleteBatch === 'function') {
        const r = await backend.deleteBatch(items.map((i) => i.subpath));
        deleted += (r && r.deleted != null) ? r.deleted : items.length;
      } else {
        for (const i of items) await backend.unlink(i.subpath);
        deleted += items.length;
      }
      for (const i of items) this.emit('delete', { path: path.normalize(i.absPath) });
    }
    return { deleted };
  }

  // Recursive listing — one backend.listTree() (rich entries + cursor) when supported, else a readdir+stat
  // walk (no cursor — that's a sync nicety, undefined elsewhere). Entry paths are absolute VFS paths.
  async listTree(p, opts) {
    const principal = opts?.principal;
    checkPermission('readdir', p, principal);
    const { backend, subpath, mount } = this.resolve(p);
    const toAbs = (sub) => path.normalize((mount === '/' ? '' : mount) + (sub.startsWith('/') ? sub : '/' + sub));
    if (typeof backend.listTree === 'function') {
      const r = await backend.listTree(subpath);
      return { entries: r.entries.map((e) => ({ ...e, path: toAbs(e.path) })), cursor: r.cursor };
    }
    const entries = [];
    const walk = async (abs, sub) => {
      let names;
      try { names = await backend.readdir(sub); } catch { return; }
      for (const name of names) {
        const childSub = sub === '/' ? '/' + name : sub + '/' + name;
        const childAbs = abs === '/' ? '/' + name : abs + '/' + name;
        let info;
        try { info = await backend.stat(childSub); } catch { continue; }
        if (info.type === 'directory') { entries.push({ path: path.normalize(childAbs), type: 'directory' }); await walk(childAbs, childSub); }
        else entries.push({ path: path.normalize(childAbs), type: 'file', size: info.size, modified: info.modified });
      }
    };
    await walk(path.normalize(p), subpath);
    return { entries, cursor: undefined };
  }
}

// -- dom.js --

// DOM helpers for @gcu/vfs — blob URLs, drag-drop, file picker
// Runtime guards: only functional in browser environments

const _blobCache = (typeof Map !== 'undefined') ? new Map() : null;
const _autoRevokeListeners = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

function toURL(vfs, p) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
    throw new Error('toURL requires a browser environment');
  }
  const key = p;
  if (_blobCache && _blobCache.has(key)) return _blobCache.get(key);

  // Set up auto-revoke listener once per VFS instance
  if (_autoRevokeListeners && !_autoRevokeListeners.has(vfs)) {
    const handler = (e) => {
      if (_blobCache && _blobCache.has(e.path)) {
        URL.revokeObjectURL(_blobCache.get(e.path));
        _blobCache.delete(e.path);
      }
    };
    vfs.on('write', handler);
    _autoRevokeListeners.set(vfs, handler);
  }

  return vfs.readFile(p, 'bytes').then(data => {
    const mimeType = path.mime(p);
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    if (_blobCache) _blobCache.set(key, url);
    return url;
  });
}

function revokeURL(url) {
  if (typeof URL === 'undefined') return;
  URL.revokeObjectURL(url);
  if (_blobCache) {
    for (const [k, v] of _blobCache) {
      if (v === url) { _blobCache.delete(k); break; }
    }
  }
}

function revokeURLs(prefix) {
  if (!_blobCache) return;
  const toDelete = [];
  for (const [k, v] of _blobCache) {
    if (k.startsWith(prefix)) {
      if (typeof URL !== 'undefined') URL.revokeObjectURL(v);
      toDelete.push(k);
    }
  }
  for (const k of toDelete) _blobCache.delete(k);
}

async function fromDrop(vfs, event, destPath) {
  const files = event.dataTransfer ? event.dataTransfer.files : [];
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(destPath, file.name);
    const buf = await file.arrayBuffer();
    await vfs.writeFile(filePath, new Uint8Array(buf));
    paths.push(filePath);
  }
  return paths;
}

function fromPicker(vfs, destPath, opts) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('fromPicker requires a browser environment'));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts && opts.multiple) input.multiple = true;
    if (opts && opts.accept) input.accept = opts.accept;
    if (opts && opts.directory) input.webkitdirectory = true;

    input.onchange = async () => {
      try {
        const paths = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const filePath = path.join(destPath, file.name);
          const buf = await file.arrayBuffer();
          await vfs.writeFile(filePath, new Uint8Array(buf));
          paths.push(filePath);
        }
        resolve(paths);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

// -- api.js --

// @gcu/vfs — integrated into the base image
// No plugin registration needed — VFS is available as a builtin.

export { VFS, VFSError, Backend, BACKEND_TYPES, CommentBackend, MemoryBackend, AbusBackend, FSAABackend, IDBBackend, OPFSBackend, FetchBackend, RESTBackend, DropboxBackend, OverlayBackend, CacheBackend, checkPermission, path };
