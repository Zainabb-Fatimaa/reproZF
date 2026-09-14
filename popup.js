document.addEventListener('DOMContentLoaded', async () => {
  const { githubToken, feedbackEndpoint } = await chrome.storage.sync.get(['githubToken', 'feedbackEndpoint']);
  if (githubToken) document.getElementById('token').value = githubToken;
  if (feedbackEndpoint) document.getElementById('feedback-endpoint').value = feedbackEndpoint;

  await refreshFeedbackCount();
});

document.getElementById('save').addEventListener('click', async () => {
  const githubToken = document.getElementById('token').value.trim();
  await chrome.storage.sync.set({ githubToken });
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 1500);
});

document.getElementById('save-endpoint').addEventListener('click', async () => {
  const feedbackEndpoint = document.getElementById('feedback-endpoint').value.trim();
  await chrome.storage.sync.set({ feedbackEndpoint: feedbackEndpoint || null });
  const status = document.getElementById('endpoint-status');
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 1500);
});

async function refreshFeedbackCount() {
  const { rs_feedback = [] } = await chrome.storage.local.get('rs_feedback');
  document.getElementById('feedback-count').textContent = rs_feedback.length;
  return rs_feedback;
}

document.getElementById('export-feedback').addEventListener('click', async () => {
  const reports = await refreshFeedbackCount();
  const statusEl = document.getElementById('feedback-status');
  if (reports.length === 0) {
    statusEl.textContent = 'No reports saved yet.';
    setTimeout(() => (statusEl.textContent = ''), 2000);
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(reports, null, 2));
    statusEl.textContent = `Copied ${reports.length} report(s) to clipboard.`;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = JSON.stringify(reports, null, 2);
    ta.style.width = '100%';
    ta.style.height = '120px';
    ta.style.marginTop = '6px';
    document.body.appendChild(ta);
    ta.select();
    statusEl.textContent = 'Clipboard unavailable, select and copy manually below.';
  }
  setTimeout(() => (statusEl.textContent = ''), 4000);
});

document.getElementById('clear-feedback').addEventListener('click', async () => {
  await chrome.storage.local.set({ rs_feedback: [] });
  await refreshFeedbackCount();
  const statusEl = document.getElementById('feedback-status');
  statusEl.textContent = 'Cleared.';
  setTimeout(() => (statusEl.textContent = ''), 1500);
});
