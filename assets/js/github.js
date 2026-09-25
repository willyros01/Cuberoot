// Minimal GitHub client for the admin Publish page.
// Uses the Git Data API so each publish is ONE commit, however many files it touches.
import { toB64 } from './vault.js';

const API = 'https://api.github.com';

export class GitHubRepo {
  constructor({ owner, repo, branch, token }) {
    this.owner = owner; this.repo = repo; this.branch = branch || 'main'; this.token = token || '';
  }

  async api(path, opts = {}) {
    const headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    if (opts.body && typeof opts.body !== 'string') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    const res = await fetch(`${API}/repos/${this.owner}/${this.repo}${path}`, { ...opts, headers, cache: 'no-store' });
    return res;
  }

  async json(path, opts) {
    const res = await this.api(path, opts);
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      const err = new Error(`GitHub ${res.status}${msg ? ': ' + msg : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  // Checks the token and returns the repository (with permissions for this token).
  async info() {
    const r = await this.json('');
    if (r.default_branch) this.branch = r.default_branch;
    return r;
  }

  // Returns file bytes, or null when the file does not exist yet.
  async read(path, ref) {
    const res = await this.api(`/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref || this.branch)}`,
      { headers: { 'Accept': 'application/vnd.github.raw' } });
    if (res.status === 404) return null;
    if (!res.ok) { const e = new Error(`GitHub ${res.status} reading ${path}`); e.status = res.status; throw e; }
    return new Uint8Array(await res.arrayBuffer());
  }

  async readJSON(path, ref) {
    const b = await this.read(path, ref);
    return b ? JSON.parse(new TextDecoder().decode(b)) : null;
  }

  async head() {
    return (await this.json(`/git/ref/heads/${encodeURIComponent(this.branch)}`)).object.sha;
  }

  // changes: [{ path, bytes: Uint8Array | string | null }]  (null deletes the file)
  // onProgress(done, total) is called as file uploads finish.
  async commit(message, changes, onProgress) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this._commit(message, changes, onProgress); }
      catch (e) { if (!(e.status === 409 || e.status === 422) || attempt === 2) throw e; }
    }
  }

  async _commit(message, changes, onProgress) {
    const ref = await this.json(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const parentSha = ref.object.sha;
    const parent = await this.json(`/git/commits/${parentSha}`);
    const tree = [];
    let done = 0;
    const uploads = changes.filter(c => c.bytes !== null);
    for (const c of changes) {
      if (c.bytes === null) { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const bytes = typeof c.bytes === 'string' ? new TextEncoder().encode(c.bytes) : c.bytes;
      const blob = await this.json('/git/blobs', { method: 'POST', body: { content: toB64(bytes), encoding: 'base64' } });
      tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
      done++; if (onProgress) onProgress(done, uploads.length);
    }
    const newTree = await this.json('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree } });
    const commit = await this.json('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [parentSha] } });
    await this.json(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    return commit.sha;
  }
}
