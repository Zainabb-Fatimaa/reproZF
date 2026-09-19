const GITHUB_RESERVED_ROOTS = new Set([
  'settings', 'notifications', 'marketplace', 'organizations', 'orgs',
  'sponsors', 'topics', 'trending', 'collections', 'codespaces', 'new',
  'login', 'join', 'about', 'pricing', 'features', 'security', 'explore',
  'apps', 'site', 'support', 'contact', 'dashboard', 'issues', 'pulls',
  'notifications', 'account', 'enterprise', 'customer-stories', 'events',
  'resources', 'solutions', 'readme', 'search', 'watching', 'stars'
]);

function parseGithubRepoFromUrl(url) {
  const m = url.match(/github\.com\/([^\/]+)\/([^\/?#]+)/);
  if (!m) return null;
  if (GITHUB_RESERVED_ROOTS.has(m[1].toLowerCase())) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

function findGithubLinkOnPage() {
  const links = Array.from(document.querySelectorAll('a[href*="github.com"]'));
  if (links.length === 0) return null;
  return parseGithubRepoFromUrl(links[0].href);
}

function waitForGithubLinkOnPage(timeoutMs) {
  const immediate = findGithubLinkOnPage();
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      const found = findGithubLinkOnPage();
      if (found) finish(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

function getArxivId() {
  const m = location.pathname.match(/abs\/([\w.\-]+)/);
  return m ? m[1] : null;
}

function findPaperPublishDateGeneric() {
  const candidates = Array.from(document.querySelectorAll(
    'time, [class*="date" i], [class*="publish" i], [data-testid*="date" i]'
  ));
  const dateRe = /\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},\s+\d{4}/;
  for (const el of candidates) {
    const text = el.getAttribute('datetime') || el.textContent || '';
    const m = text.match(dateRe);
    if (m) {
      const d = new Date(m[0]);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  return null;
}

function removeExistingWidget() {
  document.querySelectorAll('#repro-score-widget').forEach(el => el.remove());
}

function injectWidget(el) {
  removeExistingWidget();
  document.body.appendChild(el);
  return el;
}

function attachCloseHandler(el) {
  const btn = el.querySelector('.rs-close');
  if (btn) {
    btn.addEventListener('click', () => {
      widgetDismissedForThisPage = true;
      el.remove();
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function verdictFor(score, breakdown) {
  const failCount = breakdown.filter(b => b.ok === false).length;
  if (score >= 90 && failCount === 0) return 'No reproducibility red flags found in an automated check, worth a quick skim yourself before relying on it.';
  if (score >= 70) return 'Mostly fine, but worth skimming the flagged item(s) below before relying on it.';
  if (score >= 45) return 'Several reproducibility concerns, read the flagged items before trusting the results.';
  return 'Significant reproducibility concerns, multiple things below are likely to trip you up.';
}

function buildWidget(score, breakdown, meta, description, repoInfo) {
  const el = document.createElement('div');
  el.id = 'repro-score-widget';

  const color = score >= 70 ? '#2e7d32' : score >= 40 ? '#e6a700' : '#c62828';

  const rows = breakdown.map(item => `
    <div class="rs-row ${item.ok === true ? 'rs-ok' : item.ok === false ? 'rs-bad' : 'rs-neutral'}">
      <span class="rs-icon">${item.ok === true ? 'PASS' : item.ok === false ? 'FAIL' : 'INFO'}</span>
      <span class="rs-text">${item.text}</span>
      ${item.links ? `<div class="rs-links">${item.links.map(l => {
        const safeUrl = /^https:\/\/github\.com\//.test(l.url || '') ? l.url : '#';
        return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.title)}</a>`;
      }).join('')}</div>` : ''}
    </div>
  `).join('');

  el.innerHTML = `
    ${description ? `<div class="rs-description">${escapeHtml(description)}</div>` : ''}
    <div class="rs-header" style="border-color:${color}">
      <span class="rs-score" style="color:${color}">${score}/100</span>
      <span class="rs-label">Reproducibility Score</span>
      <button class="rs-min" title="Minimize">-</button>
      <button class="rs-close" title="Close">x</button>
    </div>
    <div class="rs-gist">${verdictFor(score, breakdown)}</div>
    <div class="rs-body">
      ${meta && meta.citationCount != null ? `
        <div class="rs-row rs-meta">
          <span class="rs-text">${meta.citationCount} citation${meta.citationCount === 1 ? '' : 's'} on Semantic Scholar${meta.influentialCitationCount ? ` (${meta.influentialCitationCount} influential)` : ''}</span>
        </div>` : ''}
      ${meta && meta.repoSource ? `
        <div class="rs-row rs-meta">
          <span class="rs-text">Repo found via ${
            meta.repoSource === 'github-code-search' ? "GitHub code search (README mentions this paper's arXiv ID)" :
            meta.repoSource === 'papers-with-code' ? 'Papers with Code' :
            'Semantic Scholar'
          }, not linked directly on arXiv.</span>
        </div>` : ''}
      ${rows}
    </div>
    <div class="rs-footer"><span>ReproZF · automated keyword-based checks, not a manual review.</span> <button class="rs-feedback-toggle" type="button">Something wrong?</button></div>
    <div class="rs-feedback-panel" hidden>
      <label>Which check is wrong?</label>
      <select class="rs-feedback-check">
        ${breakdown.map((item, i) => `<option value="${i}">${item.text.replace(/"/g, '&quot;').slice(0, 80)}</option>`).join('')}
        <option value="score">The overall score itself</option>
        <option value="other">Something else</option>
      </select>
      <label>What's wrong (a sentence is enough)</label>
      <textarea class="rs-feedback-note" rows="2" placeholder="e.g. this README does mention pretrained weights, just not that word"></textarea>
      <button class="rs-feedback-submit" type="button">Save report</button>
      <div class="rs-feedback-status"></div>
    </div>
  `;

  el.querySelector('.rs-min').addEventListener('click', () => {
    el.classList.add('rs-minimized');
  });

  el.addEventListener('click', (e) => {
    if (el.classList.contains('rs-minimized') && !e.target.closest('.rs-min') && !e.target.closest('.rs-close')) {
      el.classList.remove('rs-minimized');
    }
  });

  el.querySelector('.rs-close').addEventListener('click', () => {
    widgetDismissedForThisPage = true;
    el.remove();
  });

  el.querySelector('.rs-feedback-toggle').addEventListener('click', () => {
    const panel = el.querySelector('.rs-feedback-panel');
    panel.hidden = !panel.hidden;
  });

  el.querySelector('.rs-feedback-submit').addEventListener('click', async () => {
    const checkIdx = el.querySelector('.rs-feedback-check').value;
    const note = el.querySelector('.rs-feedback-note').value.trim();
    const statusEl = el.querySelector('.rs-feedback-status');
    const flaggedCheck = checkIdx === 'score' ? 'overall score'
      : checkIdx === 'other' ? 'other/unspecified'
      : breakdown[Number(checkIdx)].text;

    const report = {
      repo: repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null,
      url: location.href,
      score,
      flaggedCheck,
      note: note || null,
      timestamp: new Date().toISOString()
    };

    try {
      const { rs_feedback = [] } = await chrome.storage.local.get('rs_feedback');
      rs_feedback.push(report);
      await chrome.storage.local.set({ rs_feedback });
      const sendResponse = await sendMessage({ type: 'SEND_FEEDBACK', report });
      const sendNote = !sendResponse ? '' :
        sendResponse.skipped ? '' :
        sendResponse.ok ? ' Sent to the developer.' : ' (Send failed, saved locally only.)';

      statusEl.textContent = `Saved (${rs_feedback.length} total).${sendNote}`;
    } catch (e) {
      statusEl.textContent = 'Could not save, storage error.';
    }
  });

  return el;
}

function showLoadingWidget(label) {
  const el = document.createElement('div');
  el.id = 'repro-score-widget';
  el.innerHTML = `<div class="rs-header"><span class="rs-label">${label || 'Loading...'}</span></div>`;
  return injectWidget(el);
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function run() {
  if (widgetDismissedForThisPage) return;
  let repoInfo = null;
  let paperPublishDate = null;
  let semanticMeta = null; 
  let cameFromPaperPage = false;

  if (location.hostname === 'github.com') {
    repoInfo = parseGithubRepoFromUrl(location.href);
  } else if (location.hostname === 'arxiv.org') {
    const dateEl = document.querySelector('.dateline');
    if (dateEl) {
      const m = dateEl.textContent.match(/\d{1,2}\s+\w+\s+\d{4}/);
      if (m) paperPublishDate = new Date(m[0]).getTime();
    }

    const waitingEl = showLoadingWidget('Looking for a linked code repo...');
    repoInfo = await waitForGithubLinkOnPage(800);
    waitingEl.remove();
    if (repoInfo) cameFromPaperPage = true;

    const arxivId = getArxivId();
    if (arxivId) {
      const loadingEl = showLoadingWidget('Looking up paper on Semantic Scholar…');
      const ssResponse = await sendMessage({ type: 'LOOKUP_SEMANTIC_SCHOLAR', arxivId });
      loadingEl.remove();

      if (ssResponse && ssResponse.ok) {
        semanticMeta = {
          citationCount: ssResponse.data.citationCount,
          influentialCitationCount: ssResponse.data.influentialCitationCount
        };
        if (!repoInfo && ssResponse.data.repo) {
          repoInfo = ssResponse.data.repo;
          semanticMeta.repoSource = ssResponse.data.repoSource || 'unknown';
          cameFromPaperPage = true;
        }
      }
    }
  } else if (location.hostname === 'www.science.org' || location.hostname === 'www.researchgate.net' || location.hostname === 'www.sciencedirect.com') {
    paperPublishDate = findPaperPublishDateGeneric();
    const waitingEl2 = showLoadingWidget('Looking for a linked code repo...');
    repoInfo = await waitForGithubLinkOnPage(2500);
    if (repoInfo) cameFromPaperPage = true;

    if (!repoInfo) {
      waitingEl2.querySelector('.rs-label').textContent = 'Checking Papers with Code...';
      const pwcResponse = await sendMessage({ type: 'LOOKUP_PAPERS_WITH_CODE_BY_TITLE', title: document.title });
      if (pwcResponse && pwcResponse.ok && pwcResponse.repo) {
        repoInfo = pwcResponse.repo;
        semanticMeta = { repoSource: pwcResponse.repoSource };
        cameFromPaperPage = true;
      }
    }
    waitingEl2.remove();

    if (!repoInfo) {
      const el = document.createElement('div');
      el.id = 'repro-score-widget';
      el.innerHTML = `<div class="rs-header"><span class="rs-label">No GitHub link found (checked the page and Papers with Code by title). Support for ${location.hostname} is experimental, if this paper does link a repo, please report this as a bug.</span><button class="rs-close" title="Close">x</button></div>`;
      injectWidget(el);
      attachCloseHandler(el);
      return;
    }
  }

  if (!repoInfo) {
    if (semanticMeta) {
      const el = document.createElement('div');
      el.id = 'repro-score-widget';
      el.innerHTML = `<div class="rs-header"><span class="rs-label">No linked code repo found (${semanticMeta.citationCount ?? '?'} citations on Semantic Scholar).</span><button class="rs-close" title="Close">x</button></div>`;
      injectWidget(el);
      attachCloseHandler(el);
    } else if (location.hostname === 'arxiv.org') {
      const el = document.createElement('div');
      el.id = 'repro-score-widget';
      el.innerHTML = `<div class="rs-header"><span class="rs-label">Checked the page, Semantic Scholar, and Papers with Code, no linked GitHub repo found for this paper.</span><button class="rs-close" title="Close">x</button></div>`;
      injectWidget(el);
      attachCloseHandler(el);
    } else {
      removeExistingWidget();
    }
    return;
  }

  const loadingEl = showLoadingWidget('Checking reproducibility...');

  const response = await sendMessage(
    { type: 'SCORE_REPO', owner: repoInfo.owner, repo: repoInfo.repo, paperPublishDate, skipResearchGate: cameFromPaperPage }
  );
  if (!response || !response.ok) {
    const errorEl = document.createElement('div');
    errorEl.id = 'repro-score-widget';
    errorEl.innerHTML = `<div class="rs-header" style="border-color:#c62828"><span class="rs-label">${escapeHtml((response && response.error) || 'Failed to compute score.')}</span><button class="rs-close" title="Close">x</button></div>`;
    injectWidget(errorEl);
    attachCloseHandler(errorEl);
    console.warn('Reproducibility Score: failed to compute', response && response.error);
    return;
  }

  if (response.result.notResearchRepo) {
    const el = document.createElement('div');
    el.id = 'repro-score-widget';
    el.innerHTML = `<div class="rs-header"><span class="rs-label">${response.result.breakdown[0].text}</span><button class="rs-close" title="Close">x</button></div>`;
    injectWidget(el);
    attachCloseHandler(el);
    return;
  }

  injectWidget(buildWidget(response.result.score, response.result.breakdown, semanticMeta, response.result.description, repoInfo));
}

let lastScoredUrl = null;
let widgetDismissedForThisPage = false;

function runIfUrlChanged() {
  if (location.href === lastScoredUrl) return;
  lastScoredUrl = location.href;
  widgetDismissedForThisPage = false;
  run();
}

runIfUrlChanged();

document.addEventListener('turbo:load', runIfUrlChanged);
document.addEventListener('turbo:render', runIfUrlChanged);
document.addEventListener('pjax:end', runIfUrlChanged);

(function watchHistoryApi() {
  const fire = () => setTimeout(runIfUrlChanged, 0);
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    fire();
  };
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    fire();
  };
  window.addEventListener('popstate', fire);
})();