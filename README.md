# ReproZF

Shows a reproducibility score, right on the page, when you're browsing a research paper's GitHub repo (or a linked arXiv/Science/ResearchGate paper page). Checks things like: open issues about results not reproducing, whether setup is actually documented, whether pretrained weights/checkpoints exist, whether there's a real results section. Every score shows the breakdown behind it, not just a number.

## Install

1. Unzip this folder anywhere.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked**, select this folder.
5. Visit any GitHub repo or a linked paper page, the widget appears automatically.

## Optional: GitHub token

Without one you get 60 API requests/hour, fine for casual use, you'll hit it fast browsing several repos in a row. Click the extension icon → the popup has a "Generate a token" link, no scopes needed. Paste it in for 5,000/hour.

## Something wrong?

Every widget has a "Something wrong?" button, pick the check that's off, add a one-line note. It's automatically reported so it can get fixed.
