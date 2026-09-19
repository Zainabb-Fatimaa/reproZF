# ReproZF

Shows a reproducibility score, right on the page, when you're browsing a research paper's GitHub repo (or a linked arXiv/Science/ResearchGate/ScienceDirect paper page). Checks things like: open issues about results not reproducing, whether setup is actually documented, whether pretrained weights/checkpoints exist, whether there's a real results section. Every score shows the breakdown behind it, not just a number.

## Install

1. Unzip this folder anywhere.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked**, select this folder.
5. Visit any GitHub repo or a linked paper page, the widget appears automatically.

## Optional: GitHub token

Without one you get 60 API requests/hour, fine for casual use, you'll hit it fast browsing several repos in a row. Click the extension icon, the popup has a "Generate a token" link, no scopes needed. Paste it in for 5000/hour.

## How it calculates

Starts at 0, then adds up to 25 points per check, four checks, 100 max:

- **Open issues** (+25), no open issues flag reproduction problems
- **Setup/install docs** (+25, or +15 if setup is implied but not a copy-pasteable command), does the README actually explain how to set up the environment
- **Weights/checkpoints** (+25), are pretrained weights or checkpoints actually provided
- **Results section** (+25), is there a real results table, heading, or figure, not just the word "results" mentioned in passing

Repo activity (actively maintained vs. gone quiet) and whether there's a CI workflow are shown too, but informational only, they don't add or subtract points.

These four were picked from what repeatedly comes up as the biggest pain points when a shortlisted repo turns out to be a waste of time, partly personal experience, partly what keeps getting raised in reproducibility discussions online. If something commonly bites you that isn't on this list, that's exactly what the "Something wrong?" button is for.

## Something wrong?

Every widget has a "Something wrong?" button, pick the check that's off, add a one-line note. It's automatically reported so it can get fixed.