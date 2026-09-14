const REPRO_FAIL_PATTERNS = [ /can'?t\s+reproduce/i, /can\s*not\s+reproduce/i, /unable to (replicate|reproduce)/i, /not able to reproduce/i, /fail(ed|s|ing)? to reproduce/i, /(no|not) way to reproduce/i, /reproduc(e|tion|ibility) (issue|problem|failure)/i, /(having|have) trouble reproduc/i, /not enough to reproduce/i, /doesn'?t match (the )?paper/i, /(does not|doesn'?t) match (the )?(reported|claimed) (results?|numbers?|accuracy|score)/i, /different (results?|accuracy|numbers?|scores?|performance)/i, /(lower|worse|higher|inconsistent) (accuracy|perplexity|score|loss|performance) (than|compared to) (the )?paper/i, /which is (higher|lower|worse) than .{0,20} in paper/i, /results? (are|is|seem|seems) (not|far) (consistent|matching|close)/i, /my (results?|numbers?|accuracy) (is|are|was|were) (much )?(lower|worse|different|off)/i, /(gap|discrepancy) between (my|the) results? and (the )?paper/i, /hyper.?param.{0,60}reproduce/i, /reproduc(e|es|ed|ing) (the )?(reported |official |paper'?s )?(accuracy|results?|performance|numbers?|score)/i, /how (do|can) (i|you|we) reproduce/i, /discrepancy.{0,40}(when |while )?reproduc(e|es|ed|ing)/i, /(checkpoint|dataset|weights?|pretrained)[\w\s]{0,15}links?\s+(cannot|can'?t|don'?t|doesn'?t|do not|does not|isn'?t|is not|aren'?t|are not)\s+(be\s+)?(access|open|work|download|found|available)/i, /does(n'?t| not) achieve (the )?(expected|reported|claimed) (effect|results?|performance|accuracy)/i, /missing (checkpoint|weights|pretrained|splits?|dataset)/i, /no (pretrained )?(checkpoint|weights?) (provided|available|included)/i, /(train|val|test|data) splits? (not|isn'?t|aren'?t) (provided|available|included)/i, /no such (split|checkpoint|weights?|dataset) (is |are )?provided/i, /there (is|are) no .{0,15}(split|checkpoint|weights?) provided/i, /(code|repo) (provided|given) (is|are) not enough to reproduce/i, /where (can i find|is) the (checkpoint|pretrained model|weights)/i, /(broke|broken|breaks) (after|since|following) .*(update|upgrade)/i, /(cuda|dependency|version) (error|mismatch|conflict) .*(reproduc|run|train)/i, /(script|code) (doesn'?t|does not|won'?t|will not) run/i, /same (here|issue|problem)[.,!]? (unable|can'?t|cannot|no success)/i, /\+1.{0,20}(can'?t|cannot|unable) (to )?reproduce/i ];

const ENV_FILE_PATTERNS = {
  python: /\b(environment|env|conda)\.ya?ml\b|requirements\.txt|pyproject\.toml|pipfile|poetry\.lock|setup\.py/i,
  node: /package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml/i,
  other: /dockerfile|gemfile|go\.mod|cargo\.toml/i
};

const INSTALL_COMMAND_PATTERNS = {
  python: /\bpip3?\s+install\b|\bconda\s+(env\s+)?create\b/i,
  node: /\b(npm|yarn|pnpm)\s+(install|i|ci)\b/i,
  other: /\bdocker\s+(build|run|compose)\b|\bgo\s+get\b|\bcargo\s+build\b/i
};

const SETUP_SCRIPT_FILENAME_RE = /\b[\w.\-\/]+\.(sh|bash|ps1|bat)\b/i;

const SETUP_INTENT_WORDS_RE = /\b(setup|set[- ]?up|install|environment|env)\b/i;

function detectEnvironmentSetup(text) {
  for (const [ecosystem, re] of Object.entries(ENV_FILE_PATTERNS)) {
    if (re.test(text)) return {
      found: true,
      ecosystem: ecosystem,
      via: "file reference"
    };
  }
  for (const [ecosystem, re] of Object.entries(INSTALL_COMMAND_PATTERNS)) {
    if (re.test(text)) return {
      found: true,
      ecosystem: ecosystem,
      via: "install command"
    };
  }
  if (SETUP_SCRIPT_FILENAME_RE.test(text) && SETUP_INTENT_WORDS_RE.test(text)) {
    return {
      found: true,
      ecosystem: "shell script",
      via: "setup script reference"
    };
  }
  return {
    found: false,
    ecosystem: null,
    via: null
  };
}

function daysBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / (1e3 * 60 * 60 * 24);
}

const RESEARCH_SIGNAL_PATTERNS = [ /arxiv\.org\/(abs|pdf)/i, /\bdoi\.org\//i, /@inproceedings\{/i, /@article\{/i, /##?\s*citation\b/i, /how to cite/i, /bibtex/i, /\bcitation\.cff\b/i, /official (\w+\s+)?(implementation|code(base)?|repo(sitory)?) (of|for)/i ];

const REPRODUCTION_CONTEXT_RE = /\breproduc(e|es|ed|ing|tion)\b/i;

const MODEL_CONTEXT_RE = /pretrained|checkpoint|\.pth|\.ckpt|state-of-the-art|\bsota\b|benchmark|perplexity|hugging ?face|model zoo/i;

const META_DESCRIPTION_RE = /\bchecks?\b[\s\S]{0,80}\bwhether\b|\bwhether\b[\s\S]{0,80}\bexists?\b/i;

function looksLikeResearchCode(readmeText, repoMeta) {
  const haystack = `${readmeText || ""} ${repoMeta && repoMeta.description || ""}`;
  if (RESEARCH_SIGNAL_PATTERNS.some(re => re.test(haystack))) return true;
  if (META_DESCRIPTION_RE.test(haystack)) return false;
  return REPRODUCTION_CONTEXT_RE.test(haystack) && MODEL_CONTEXT_RE.test(haystack);
}

function scoreRepo({repoMeta: repoMeta, issues: issues, readmeText: readmeText, hasWorkflow: hasWorkflow, paperPublishDate: paperPublishDate, skipResearchGate: skipResearchGate}) {
  if (!skipResearchGate && !paperPublishDate && !looksLikeResearchCode(readmeText, repoMeta)) {
    return {
      score: null,
      notResearchRepo: true,
      breakdown: [ {
        ok: null,
        text: `No sign this repo is tied to a research paper (no arXiv/DOI link, no citation section), skipping the reproducibility check rather than guessing.`
      } ]
    };
  }
  const breakdown = [];
  let score = 100;
  if (repoMeta && repoMeta.pushed_at) {
    const daysSinceLastCommit = daysBetween(repoMeta.pushed_at, Date.now());
    if (paperPublishDate) {
      const daysAfterPaper = daysBetween(repoMeta.pushed_at, paperPublishDate);
      if (daysSinceLastCommit > 300 && daysAfterPaper < 90) {
        score -= 25;
        breakdown.push({
          ok: false,
          text: `Repo went quiet ~${Math.round(daysAfterPaper)} days after the paper and hasn't been touched since (${Math.round(daysSinceLastCommit)} days ago).`
        });
      } else if (daysSinceLastCommit > 365) {
        score -= 10;
        breakdown.push({
          ok: false,
          text: `Last commit was ${Math.round(daysSinceLastCommit)} days ago.`
        });
      } else {
        breakdown.push({
          ok: true,
          text: `Actively maintained (last commit ${Math.round(daysSinceLastCommit)} days ago).`
        });
      }
    }
  }
  const failIssues = (issues || []).filter(iss => {
    const text = `${iss.title || ""} ${iss.body || ""}`;
    return REPRO_FAIL_PATTERNS.some(re => re.test(text));
  });
  if (failIssues.length > 0) {
    const penalty = Math.min(30, failIssues.length * 6);
    score -= penalty;
    breakdown.push({
      ok: false,
      text: `${failIssues.length} open issue(s) mention reproduction problems.`,
      links: failIssues.slice(0, 5).map(i => ({
        title: i.summary || i.title,
        url: i.html_url
      }))
    });
  } else {
    breakdown.push({
      ok: true,
      text: `No open issues matched known reproduction-failure phrasing (checked the ${Math.min((issues || []).length, 50)} most recent open issues; differently worded reports can be missed).`
    });
  }
  if (readmeText) {
    const lower = readmeText.toLowerCase();
    const envSetup = detectEnvironmentSetup(lower);
    const hasWeights = /pre-?trained|checkpoint|\.pth|\.ckpt|download.*weights|model zoo|hugging ?face|model card|load_model|\bweights?\b|available in (\w+ )?(model )?(sizes|configurations|variants)/.test(lower);
    const hasResultsTable = /\|[\s:-]*-{2,}[\s:-]*\|/.test(readmeText) || /^#{1,4}\s*.*\b(results?|performance|benchmarks?|evaluation|leaderboard|experiments?|comparisons?)\b/im.test(readmeText) || /\bfigure\s*\d+\s*[:.]?\s*[^\n]{0,150}\b(performance|accuracy|results?|auroc|fpr|f1[\s-]?score|comparison|detection rate|success rate)\b/i.test(readmeText);
    const linksToInstallDoc = /\[[^\]]*install[^\]]*\]\([^)]+\)/i.test(readmeText);
    const namesRequiredTooling = /(prerequisites?|requirements?)\s*:?[\s\S]{0,80}\b(tensorflow|pytorch|python|cuda|jax)\b/i.test(readmeText) || /\btested (with|on)\b[\s\S]{0,80}\b(python|pytorch|tensorflow|cuda|jax)\b/i.test(readmeText);
    if (envSetup.found) {
      breakdown.push({
        ok: true,
        text: `README shows how to set up the environment (${envSetup.ecosystem}, via ${envSetup.via}).`
      });
    } else if (linksToInstallDoc) {
      breakdown.push({
        ok: null,
        text: `No inline install command in the README, but it links out to a separate install doc (contents not checked).`
      });
    } else if (namesRequiredTooling) {
      score -= 5;
      breakdown.push({
        ok: null,
        text: `README names required tooling (e.g. a specific framework/version) but has no copy-pasteable install command.`
      });
    } else {
      score -= 10;
      breakdown.push({
        ok: false,
        text: `No dependency file or install command found in README.`
      });
    }
    if (hasWeights) {
      breakdown.push({
        ok: true,
        text: `Pretrained weights/checkpoints appear to be provided.`
      });
    } else {
      score -= 10;
      breakdown.push({
        ok: false,
        text: `No pretrained weights or checkpoints mentioned.`
      });
    }
    if (hasResultsTable) {
      breakdown.push({
        ok: true,
        text: `README includes a results section/table.`
      });
    } else {
      score -= 5;
      breakdown.push({
        ok: false,
        text: `No results section or table found in README (a "results" mention in prose doesn't count).`
      });
    }
  } else {
    score -= 15;
    breakdown.push({
      ok: false,
      text: `Could not find a README.`
    });
  }
  if (hasWorkflow) {
    breakdown.push({
      ok: true,
      text: `Repo has a CI workflow configured.`
    });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: score,
    breakdown: breakdown,
    description: repoMeta && repoMeta.description || null
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    scoreRepo: scoreRepo,
    REPRO_FAIL_PATTERNS: REPRO_FAIL_PATTERNS,
    looksLikeResearchCode: looksLikeResearchCode
  };
}