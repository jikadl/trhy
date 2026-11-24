// Přístup k soukromému repozitáři s daty přes GitHub API.

const API = "https://api.github.com";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export class Api {
  constructor(token, repo) {
    this.token = token;
    this.repo = repo;
  }

  async req(path, { method = "GET", body, accept = "application/vnd.github+json", cache } = {}) {
    const r = await fetch(`${API}${path}`, {
      method,
      cache,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json()).message || msg; } catch {}
      throw new ApiError(r.status, msg);
    }
    return r;
  }

  // obsah souboru jako text; null když neexistuje
  async raw(path, { fresh = false } = {}) {
    try {
      const r = await this.req(`/repos/${this.repo}/contents/${path}?ref=main`, {
        accept: "application/vnd.github.raw+json",
        cache: fresh ? "no-cache" : "default",
      });
      return await r.text();
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // soubor včetně sha (pro zápis)
  async file(path) {
    const r = await this.req(`/repos/${this.repo}/contents/${path}?ref=main`, { cache: "no-cache" });
    const j = await r.json();
    return { text: b64decode(j.content), sha: j.sha };
  }

  async put(path, text, sha, message) {
    const r = await this.req(`/repos/${this.repo}/contents/${path}`, {
      method: "PUT",
      body: { message, content: b64encode(text), sha, branch: "main" },
    });
    return (await r.json()).content.sha;
  }

  async dispatch(workflow, inputs = {}) {
    await this.req(`/repos/${this.repo}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      body: { ref: "main", inputs },
    });
  }

  async runs(workflow, perPage = 5) {
    const r = await this.req(`/repos/${this.repo}/actions/workflows/${workflow}/runs?per_page=${perPage}`, { cache: "no-cache" });
    return (await r.json()).workflow_runs || [];
  }
}
