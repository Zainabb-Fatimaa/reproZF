// background.js
importScripts('scorer.js');

try {
  importScripts('config.js');
} catch (e) {
  try {
    importScripts('config.example.js');
  } catch (e2) {

  }
}
const FEEDBACK_ENDPOINT_FALLBACK = typeof DEFAULT_FEEDBACK_ENDPOINT !== 'undefined' ? DEFAULT_FEEDBACK_ENDPOINT : null;

async function ghFetch(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const resetHeader = res.headers.get('x-ratelimit-reset');
        const resetMins = resetHeader
          ? Math.max(1, Math.round((Number(resetHeader) * 1000 - Date.now()) / 60000))
          : null;
        throw new Error(
          token
            ? `GitHub rate limit reached${resetMins ? `, resets in ~${resetMins} min` : ''}.`
            : `GitHub rate limit reached (60/hr without a token, add one in the extension's popup for 5,000/hr).`
        );
      }
      throw new Error(`GitHub API refused the request (403), the repo may be private or access-restricted.`);
    }
    if (res.status === 404) {
      throw new Error(`Repo not found on GitHub (404), check the URL is correct.`);
    }
    throw new Error(`GitHub API error ${res.status} for ${url}`);
  }

  return res.json();
}

async function getReadmeText(owner, repo, token) {
  try {
    const headers = { Accept: 'application/vnd.github.raw+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function hasWorkflowFile(owner, repo, token) {
  try {
    const data = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`, token);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function computeScoreForRepo(owner, repo, token, paperPublishDate, skipResearchGate) {
  const repoMeta = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, token);
  const issues = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=50`, token);
  const readmeText = await getReadmeText(owner, repo, token);
  const hasWorkflow = await hasWorkflowFile(owner, repo, token);

  return scoreRepo({ repoMeta, issues, readmeText, hasWorkflow, paperPublishDate, skipResearchGate });
}

async function findRepoViaPapersWithCode(arxivId) {
  const cleanId = arxivId.replace(/v\d+$/, '');
  const paperRes = await fetch(`https://paperswithcode.com/api/v1/papers/?arxiv_id=${encodeURIComponent(cleanId)}`);
  if (!paperRes.ok) return null;
  const paperData = await paperRes.json();
  const paper = paperData.results && paperData.results[0];
  if (!paper) return null;
  return repoFromPapersWithCodePaper(paper.id);
}

async function findRepoViaPapersWithCodeTitle(title) {
  if (!title) return null;
  const paperRes = await fetch(`https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(title)}`);
  if (!paperRes.ok) return null;
  const paperData = await paperRes.json();
  const paper = paperData.results && paperData.results[0];
  if (!paper) return null;
  return repoFromPapersWithCodePaper(paper.id);
}

async function repoFromPapersWithCodePaper(paperId) {
  const repoRes = await fetch(`https://paperswithcode.com/api/v1/papers/${paperId}/repositories/`);
  if (!repoRes.ok) return null;
  const repoData = await repoRes.json();
  const repos = repoData.results || [];
  if (repos.length === 0) return null;

  const best = repos.find(r => r.is_official) || repos[0];
  if (!best || !best.url) return null;
  const m = best.url.match(/github\.com\/([^\/]+)\/([^\/?#]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function findRepoViaGithubCodeSearch(arxivId, token) {
  if (!token) return null;

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`
  };

  const queries = [
    `${arxivId} in:readme`,
    `arxiv.org/abs/${arxivId} in:readme`
  ];

  for (const q of queries) {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=5`;
    const res = await fetch(url, { headers });
    if (!res.ok) continue; 
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return { owner: item.repository.owner.login, repo: item.repository.name };
    }
  }
  return null;
}

async function lookupSemanticScholar(arxivId) {
  const fields = 'citationCount,influentialCitationCount,externalIds,openAccessPdf,title';
  const url = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${arxivId}?fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Semantic Scholar API ${res.status}`);
  const data = await res.json();

  let repo = null;
  const candidateStrings = JSON.stringify(data.externalIds || {}) + (data.openAccessPdf ? JSON.stringify(data.openAccessPdf) : '');
  const m = candidateStrings.match(/github\.com\/([^\/"]+)\/([^\/"]+)/);
  if (m) {
    repo = { owner: m[1], repo: m[2] };
  }

  return {
    citationCount: data.citationCount,
    influentialCitationCount: data.influentialCitationCount,
    repo
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_FEEDBACK') {
    (async () => {
      try {
        const { feedbackEndpoint } = await chrome.storage.sync.get('feedbackEndpoint');
        const endpoint = feedbackEndpoint || FEEDBACK_ENDPOINT_FALLBACK;
        if (!endpoint) {
          sendResponse({ ok: false, skipped: true });
          return;
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(msg.report)
        });
        sendResponse({ ok: res.ok });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (msg.type === 'LOOKUP_PAPERS_WITH_CODE_BY_TITLE') {
    (async () => {
      try {
        const repo = await findRepoViaPapersWithCodeTitle(msg.title);
        sendResponse({ ok: true, repo, repoSource: repo ? 'papers-with-code' : null });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (msg.type === 'LOOKUP_SEMANTIC_SCHOLAR') {
    (async () => {
      try {
        const { githubToken } = await chrome.storage.sync.get('githubToken');
        const data = await lookupSemanticScholar(msg.arxivId);
        if (!data.repo) {
          try {
            const pwcRepo = await findRepoViaPapersWithCode(msg.arxivId);
            if (pwcRepo) {
              data.repo = pwcRepo;
              data.repoSource = 'papers-with-code';
            }
          } catch (e) {
            console.warn('Papers with Code fallback failed:', e.message);
          }
        }
        if (!data.repo) {
          try {
            const codeSearchRepo = await findRepoViaGithubCodeSearch(msg.arxivId, githubToken);
            if (codeSearchRepo) {
              data.repo = codeSearchRepo;
              data.repoSource = 'github-code-search';
            } else if (data.repo === null) {
              data.repoSource = null;
            }
          } catch (e) {
            console.warn('GitHub code search fallback failed:', e.message);
          }
        } else {
          data.repoSource = data.repoSource || 'semantic-scholar';
        }

        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'SCORE_REPO') {
    (async () => {
      try {
        const { githubToken } = await chrome.storage.sync.get('githubToken');
        const result = await computeScoreForRepo(msg.owner, msg.repo, githubToken, msg.paperPublishDate, msg.skipResearchGate);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; 
  }
});
