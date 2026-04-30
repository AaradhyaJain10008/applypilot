document.addEventListener('DOMContentLoaded', () => {
    const jdInput = document.getElementById('jd');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const moveToPeopleBtn = document.getElementById('moveToPeopleBtn');
    
    // UI Elements
    const initialState = document.getElementById('initial-state');
    const loadingState = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const quotaHealth = document.getElementById('quotaHealth');
    const analysisStep = document.getElementById('analysis-step');
    const peopleStep = document.getElementById('people-step');
    const draftStep = document.getElementById('draft-step');
    const draftLoading = document.getElementById('draftLoading');
    const toast = document.getElementById('toast');
    
    // Analysis Result Fields
    const fitScoreNum = document.getElementById('fitScoreNum');
    const fitScoreBox = document.querySelector('.fit-score-box');
    const extractedRole = document.getElementById('extractedRole');
    
    // Assessment Cards
    const sponsorshipStatus = document.getElementById('sponsorshipStatus');
    const sponsorshipDetails = document.getElementById('sponsorshipDetails');
    const locationStatus = document.getElementById('locationStatus');
    const locationDetails = document.getElementById('locationDetails');
    const technicalStatus = document.getElementById('technicalStatus');
    const technicalDetails = document.getElementById('technicalDetails');
    const experienceStatus = document.getElementById('experienceStatus');
    const experienceDetails = document.getElementById('experienceDetails');
    const domainStatus = document.getElementById('domainStatus');
    const domainDetails = document.getElementById('domainDetails');
    
    // Verdict Table
    const verdictExperience = document.getElementById('verdictExperience');
    const verdictTech = document.getElementById('verdictTech');
    const verdictGrowth = document.getElementById('verdictGrowth');
    const verdictRec = document.getElementById('verdictRec');

    const companyInput = document.getElementById('company');
    const positionInput = document.getElementById('position');
    const targetPersona = document.getElementById('targetPersona');
    const resumeSelect = document.getElementById('resumeSelect');
    
    // LinkedIn search shortcuts. Alumni is always rendered in the template,
    // while label/emoji/school-slug remain profile-driven from /api/config.
    const searchAlumniBtn = document.getElementById('searchAlumniBtn');
    const searchRecruiterBtn = document.getElementById('searchRecruiterBtn');
    const searchManagerBtn = document.getElementById('searchManagerBtn');

    // App config (loaded once on page load) — used for affinity-search slug,
    // signoff name, feature flags, etc. so this file ships zero personal data.
    let APP_CONFIG = { ui: {}, candidate: {}, features: {}, alumni: { enabled: false, school_slug: '' } };
    fetch('/api/config').then(r => r.json()).then(cfg => { APP_CONFIG = cfg || APP_CONFIG; }).catch(() => {});
    
    // Draft Action Fields
    const contactNameInput = document.getElementById('contactName');
    const targetEmailInput = document.getElementById('targetEmail');
    const draftNoteBtn = document.getElementById('draftNoteBtn');
    const draftBtn = document.getElementById('draftBtn');
    
    // Final Draft Fields
    const connectionNote = document.getElementById('connectionNote');
    const copyNoteBtn = document.getElementById('copyNoteBtn');
    const subjectInput = document.getElementById('subject');
    const bodyInput = document.getElementById('body');
    const scheduleNextMorning = document.getElementById('scheduleNextMorning');
    const sendBtn = document.getElementById('sendBtn');
    const loopBtn = document.getElementById('loopBtn');

    // Step-4 attach-resume dropdown — the authoritative source of which PDF
    // actually gets attached at send-time. Two-way synced with the Step-3
    // "Optimum persona" dropdown, but the user can override right before
    // firing execution.
    const resumeAttach = document.getElementById('resumeAttach');
    const resumeAttachHint = document.getElementById('resumeAttachHint');
    const chooseDraftPersonaBtn = document.getElementById('chooseDraftPersonaBtn');
    const chooseCoverPersonaBtn = document.getElementById('chooseCoverPersonaBtn');

    // Cache of {code, label, filename, exists} entries from /api/resumes, so
    // the attach hint can show a nice "Attaching: Data Analyst" string and so
    // the labels survive a server round-trip.
    let RESUME_REGISTRY = [];
    // Populated from /api/resumes once it loads; stays empty before then so we
    // never display labels that don't match the user's actual personas.
    let RESUME_LABELS = {};

    const populateResumeDropdown = (selectEl, items, preferredCode) => {
        if (!selectEl) return;
        const previouslyChosen = selectEl.value;
        selectEl.innerHTML = '';
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.code;
            opt.textContent = item.exists
                ? `${item.label} (${item.code})`
                : `${item.label} (${item.code}) — file missing`;
            if (!item.exists) opt.disabled = true;
            selectEl.appendChild(opt);
        });
        const available = items.filter(i => i.exists).map(i => i.code);
        const fallback = available[0] || (items[0] && items[0].code) || '';
        const next = [preferredCode, previouslyChosen, fallback].find(v => v && available.includes(v));
        if (next) selectEl.value = next;
    };

    const updateResumeAttachHint = () => {
        if (!resumeAttachHint || !resumeAttach) return;
        const chosen = resumeAttach.value;
        const label = RESUME_LABELS[chosen] || chosen || '—';
        const entry = RESUME_REGISTRY.find(r => r.code === chosen);
        if (entry && !entry.exists) {
            resumeAttachHint.textContent = `⚠️ ${label} resume file is missing from the project folder — send will fail.`;
            resumeAttachHint.style.color = '#f87171';
        } else {
            resumeAttachHint.textContent = `Attaching: ${label} resume — override if you want a different one.`;
            resumeAttachHint.style.color = '';
        }
    };

    const applyPersonaSelection = (code) => {
        if (!code) return;
        if (resumeSelect) resumeSelect.value = code;
        if (resumeAttach) resumeAttach.value = code;
        updateResumeAttachHint();
        saveSession();
    };

    const promptForPersona = (contextLabel) => {
        const available = (RESUME_REGISTRY || []).filter(item => item.exists);
        if (!available.length) {
            alert('No valid resume personas are available yet. Check /api/resumes and PDF files.');
            return null;
        }
        const currentCode = (resumeAttach && resumeAttach.value) || (resumeSelect && resumeSelect.value) || available[0].code;
        const lines = available.map(item => `${item.code} = ${item.label}`);
        const userInput = prompt(
            `Choose resume persona for ${contextLabel}.\n\n${lines.join('\n')}\n\nType a code (current: ${currentCode}):`,
            currentCode
        );
        if (userInput === null) return null;
        const chosen = userInput.trim().toUpperCase();
        if (!chosen) return null;
        const match = available.find(item => item.code === chosen);
        if (!match) {
            alert(`Invalid resume code "${chosen}". Use one of: ${available.map(a => a.code).join(', ')}`);
            return null;
        }
        applyPersonaSelection(chosen);
        return chosen;
    };

    const loadResumeRegistry = async () => {
        try {
            const resp = await fetch('/api/resumes');
            if (!resp.ok) return;
            const data = await resp.json();
            RESUME_REGISTRY = data.resumes || [];
            RESUME_LABELS = {};
            RESUME_REGISTRY.forEach(r => { RESUME_LABELS[r.code] = r.label; });
            // Populate both dropdowns with the same registry. Preserve the
            // user's earlier choice if they already picked something.
            populateResumeDropdown(resumeSelect, RESUME_REGISTRY);
            populateResumeDropdown(resumeAttach, RESUME_REGISTRY, resumeSelect && resumeSelect.value);
            updateResumeAttachHint();
        } catch (err) {
            console.warn('Failed to load resume registry:', err);
        }
    };

    // Keep the two dropdowns in sync: whichever one the user touches wins,
    // but they mirror on every change. This way the Step-3 recommendation
    // and the Step-4 attach choice never silently disagree.
    const syncResumeDropdowns = () => {
        if (!resumeSelect || !resumeAttach) return;
        resumeSelect.addEventListener('change', () => {
            if (resumeAttach.value !== resumeSelect.value) {
                resumeAttach.value = resumeSelect.value;
            }
            updateResumeAttachHint();
        });
        resumeAttach.addEventListener('change', () => {
            if (resumeSelect.value !== resumeAttach.value) {
                resumeSelect.value = resumeAttach.value;
            }
            updateResumeAttachHint();
        });
    };
    syncResumeDropdowns();
    loadResumeRegistry();

    // Step-4 inline email field — two-way synced with Step-3 targetEmail.
    const targetEmailInline = document.getElementById('targetEmailInline');
    const syncEmailFields = () => {
        if (!targetEmailInline || !targetEmailInput) return;
        targetEmailInput.addEventListener('input', () => {
            if (document.activeElement !== targetEmailInline) {
                targetEmailInline.value = targetEmailInput.value;
            }
        });
        targetEmailInline.addEventListener('input', () => {
            if (document.activeElement !== targetEmailInput) {
                targetEmailInput.value = targetEmailInline.value;
            }
        });
        // Initial sync on load (in case the browser autofilled either field).
        if (targetEmailInput.value && !targetEmailInline.value) {
            targetEmailInline.value = targetEmailInput.value;
        } else if (targetEmailInline.value && !targetEmailInput.value) {
            targetEmailInput.value = targetEmailInline.value;
        }
    };
    syncEmailFields();
    // Helper: pull whichever email is populated (inline wins because it's the
    // one the user sees right next to the Send button).
    const getRecipientEmail = () => {
        const inline = (targetEmailInline && targetEmailInline.value || '').trim();
        const upstream = (targetEmailInput && targetEmailInput.value || '').trim();
        return inline || upstream;
    };

    // =================================================================
    // SESSION PERSISTENCE
    // =================================================================
    // Save every form field + the last analysis result to localStorage
    // so a browser refresh (or the user closing the tab mid-flow) never
    // loses the JD, the parsed company/position, the analysis, the
    // drafted email, or the current step. Restores automatically on
    // page load.
    //
    // Triggered by: `input` / `change` on any tracked field, and
    // explicitly after every analysis or draft finishes.
    // Cleared by: the "Clear session" button, or after a successful
    // Fire Execution (email sent) so the next JD starts clean.
    // =================================================================
    const SESSION_KEY = 'ccc_session_v1';
    const SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
    // Fields whose text content we want to restore verbatim.
    const SESSION_TEXT_FIELDS = [
        'jd', 'company', 'position', 'contactName', 'targetEmail', 'targetEmailInline',
        'connectionNote', 'subject', 'body', 'coverLetterText',
    ];
    // Dropdowns that should round-trip too.
    const SESSION_SELECT_FIELDS = [
        'resumeSelect', 'resumeAttach', 'coverToneSelect',
    ];
    // UI sections to restore visibility on.
    const SESSION_STEP_FIELDS = [
        'initial-state', 'loading', 'analysis-step', 'people-step', 'draft-step', 'coverLetterSection',
    ];

    const readField = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    const writeField = (id, value) => {
        const el = document.getElementById(id);
        if (el && typeof value === 'string') el.value = value;
    };
    const visibleState = () => {
        const out = {};
        SESSION_STEP_FIELDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) out[id] = !el.classList.contains('hidden');
        });
        return out;
    };

    let sessionSaveTimer = null;
    let cachedAnalysisResult = null; // raw API payload from last successful /api/analyze

    const saveSession = () => {
        // Debounce so fast keystrokes don't thrash localStorage.
        clearTimeout(sessionSaveTimer);
        sessionSaveTimer = setTimeout(() => {
            try {
                const payload = {
                    ts: Date.now(),
                    fields: {},
                    selects: {},
                    visible: visibleState(),
                    analysis: cachedAnalysisResult || null,
                };
                SESSION_TEXT_FIELDS.forEach(id => { payload.fields[id] = readField(id); });
                SESSION_SELECT_FIELDS.forEach(id => { payload.selects[id] = readField(id); });
                localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
            } catch (err) {
                // localStorage quota or privacy mode — silent failure is fine.
                console.warn('Session save failed:', err);
            }
        }, 300);
    };

    const loadSession = () => {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.ts) return null;
            if (Date.now() - data.ts > SESSION_MAX_AGE_MS) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return data;
        } catch (err) {
            return null;
        }
    };

    const clearSession = () => {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        cachedAnalysisResult = null;
    };

    // Wire up auto-save on every tracked field. Using capture=true so we
    // catch changes even on fields that get populated programmatically
    // (analysis result → company/position writes fire `input` events).
    const attachAutoSave = () => {
        [...SESSION_TEXT_FIELDS, ...SESSION_SELECT_FIELDS].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', saveSession);
            el.addEventListener('change', saveSession);
        });
    };
    attachAutoSave();

    // Expose a "Clear session" button — optional but important when the
    // user wants a pristine run after finishing an application.
    const clearSessionBtn = document.getElementById('clearSessionBtn');
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', () => {
            if (!confirm('Clear the saved session? This wipes the current JD, drafts, and analysis state. Your CSV history is untouched.')) return;
            clearSession();
            // Soft reset: reload the page so every widget resets cleanly.
            location.reload();
        });
    }

    // Restore a rendered analysis without re-hitting the API. This
    // mirrors the logic inside the analyze fetch callback, trimmed to
    // the pieces that only depend on the cached result.
    const rehydrateAnalysisFromCache = (result) => {
        if (!result) return;
        cachedAnalysisResult = result;
        const cName = result.company || '';
        const pName = result.position || '';
        writeField('company', cName);
        writeField('position', pName);
        const recommendedCode = (result.resume_code || 'DS').toUpperCase();
        const resumeSelectEl = document.getElementById('resumeSelect');
        const resumeAttachEl = document.getElementById('resumeAttach');
        if (resumeSelectEl) resumeSelectEl.value = recommendedCode;
        if (resumeAttachEl) resumeAttachEl.value = recommendedCode;
        const pickedLabel = (typeof RESUME_LABELS === 'object' && RESUME_LABELS[recommendedCode]) || recommendedCode;
        const resumePickBadgeEl = document.getElementById('resumePickBadge');
        const resumePickNameEl = document.getElementById('resumePickName');
        const resumePickRationaleEl = document.getElementById('resumePickRationale');
        if (resumePickBadgeEl) resumePickBadgeEl.textContent = recommendedCode;
        if (resumePickNameEl) resumePickNameEl.textContent = `${pickedLabel} resume (${recommendedCode})`;
        if (resumePickRationaleEl) resumePickRationaleEl.textContent = (result.resume_rationale || '').trim() || 'This persona best matches the JD signals detected during analysis.';
        const suggestedContact = result.suggested_contact || 'Talent Acquisition Manager';
        const targetPersonaEl = document.getElementById('targetPersona');
        if (targetPersonaEl) targetPersonaEl.textContent = suggestedContact;
        // Cards
        const safeCardLocal = (obj, fallbackDetails) => ({
            status: (obj && obj.status) ? obj.status : '--',
            details: (obj && obj.details) ? obj.details : fallbackDetails,
        });
        const cardMap = [
            ['sponsorship_legal', 'sponsorshipStatus', 'sponsorshipDetails', 'No sponsorship assessment returned.'],
            ['experience_seniority', 'experienceStatus', 'experienceDetails', 'No experience assessment returned.'],
            ['technical_alignment', 'technicalStatus', 'technicalDetails', 'No technical assessment returned.'],
            ['domain_specialty_gap', 'domainStatus', 'domainDetails', 'No domain assessment returned.'],
            ['location_pay', 'locationStatus', 'locationDetails', 'No location/pay assessment returned.'],
        ];
        cardMap.forEach(([srcKey, statusId, detailsId, fb]) => {
            const src = result[srcKey] || (srcKey === 'domain_specialty_gap' ? result.cultural_match : null);
            const card = safeCardLocal(src, fb);
            const statusEl = document.getElementById(statusId);
            const detailsEl = document.getElementById(detailsId);
            if (statusEl) statusEl.textContent = card.status;
            if (detailsEl) detailsEl.textContent = card.details;
        });
        const verdict = result.strategic_verdict || {};
        writeField('verdictExperience', verdict.experience_fit || '--/10');
        const verdictExpEl = document.getElementById('verdictExperience');
        const verdictTechEl = document.getElementById('verdictTech');
        const verdictGrowthEl = document.getElementById('verdictGrowth');
        const verdictRecEl = document.getElementById('verdictRec');
        if (verdictExpEl) verdictExpEl.textContent = verdict.experience_fit || '--/10';
        if (verdictTechEl) verdictTechEl.textContent = verdict.technical_fit || '--/10';
        if (verdictGrowthEl) verdictGrowthEl.textContent = verdict.growth_fit || '--/10';
        if (verdictRecEl) verdictRecEl.textContent = verdict.recommendation || '--';
        const score = Number.isFinite(Number(result.fit_score)) ? Number(result.fit_score) : 0;
        const fitScoreNumEl = document.getElementById('fitScoreNum');
        const fitScoreBoxEl = document.querySelector('.fit-score-box');
        const extractedRoleEl = document.getElementById('extractedRole');
        if (fitScoreNumEl) fitScoreNumEl.textContent = `${score}%`;
        if (extractedRoleEl) extractedRoleEl.textContent = result.position || 'Role Match';
        let color = '#10b981';
        if (score < 50) color = '#ef4444';
        else if (score < 75) color = '#f59e0b';
        if (fitScoreBoxEl) {
            fitScoreBoxEl.style.background = `conic-gradient(${color} ${score}%, transparent 0%)`;
        }
        if (fitScoreNumEl) fitScoreNumEl.style.color = color;
        const meta = result._meta || {};
        const provenanceWrap = document.getElementById('analysisProvenance');
        const providerChip = document.getElementById('analysisProviderChip');
        const latencyChip = document.getElementById('analysisLatencyChip');
        if (provenanceWrap && providerChip && latencyChip && meta.provider) {
            const providerLabel = meta.provider.charAt(0).toUpperCase() + meta.provider.slice(1);
            const modelPart = meta.model && meta.model !== 'unknown' ? ` · ${meta.model}` : '';
            providerChip.textContent = `${providerLabel}${modelPart} (restored)`;
            const seconds = (meta.latency_ms || 0) / 1000;
            latencyChip.textContent = seconds >= 0.1 ? `${seconds.toFixed(1)}s` : '—';
            provenanceWrap.classList.remove('hidden');
        }
    };

    // Restore on page load.
    const restoreSession = () => {
        const data = loadSession();
        if (!data) return;
        // Fields
        Object.entries(data.fields || {}).forEach(([id, val]) => writeField(id, val));
        // Selects (may race with the /api/resumes fetch — wait a beat)
        const applySelects = () => {
            Object.entries(data.selects || {}).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el && val && [...el.options].some(o => o.value === val)) {
                    el.value = val;
                }
            });
        };
        applySelects();
        setTimeout(applySelects, 500);
        // Analysis result
        if (data.analysis) {
            rehydrateAnalysisFromCache(data.analysis);
        }
        // Visibility
        const vis = data.visible || {};
        SESSION_STEP_FIELDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (vis[id]) el.classList.remove('hidden');
            else el.classList.add('hidden');
        });
        // Surface a small "session restored" toast so the user knows state
        // came from cache (helpful after a browser refresh).
        const restoredBanner = document.getElementById('sessionRestoredBanner');
        if (restoredBanner) {
            const ageMinutes = Math.round((Date.now() - data.ts) / 60000);
            restoredBanner.textContent = ageMinutes < 2
                ? 'Session restored from just now.'
                : `Session restored from ${ageMinutes} min ago.`;
            restoredBanner.classList.remove('hidden');
            setTimeout(() => restoredBanner.classList.add('hidden'), 6000);
        }
    };
    // Wait for the resume registry to load so the dropdown has real options
    // before we try to restore the selected value.
    setTimeout(restoreSession, 150);
    const agentQuestionInput = document.getElementById('agentQuestion');
    const agentAskBtn = document.getElementById('agentAskBtn');
    const agentChatLog = document.getElementById('agentChatLog');

    const appendAgentMessage = (role, text) => {
        if (!agentChatLog) return;
        const bubble = document.createElement('div');
        bubble.className = `agent-msg ${role}`;
        bubble.textContent = text;
        agentChatLog.appendChild(bubble);
        agentChatLog.scrollTop = agentChatLog.scrollHeight;
    };

    const clipConnectionNote = (text) => {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (normalized.length <= 300) return normalized;
        return `${normalized.slice(0, 299).trimEnd()}…`;
    };

    const LINKEDIN_US_GEO_URN = '["103644278"]'; // United States URN for the keyword-search fallback.

    // Convert "Acme Electric Company" -> "acme-electric-company"
    // so we can deep-link into LinkedIn's company People page, which is the
    // ONLY URL pattern that actually constrains results to people at that
    // company without knowing LinkedIn's internal numeric URN.
    const companyToLinkedInSlug = (name) => {
        if (!name) return '';
        return name
            .toLowerCase()
            .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // strip accents
            .replace(/[\u2018\u2019\u201C\u201D'`]/g, '')         // smart/straight quotes
            .replace(/&/g, ' and ')
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    };

    // Strip seniority + title-noise from a position string and surface the
    // underlying *function* keyword so we can search for managers in that
    // function. "Specialist, Data Analysis" -> "Data Analysis".
    const positionToFunction = (position) => {
        if (!position) return '';
        const NOISE = /\b(specialist|junior|jr|senior|sr|lead|principal|staff|intern|associate|analyst|engineer|scientist|developer|architect|manager|mgr|director|head|chief|vp|vice|president|coordinator|consultant|executive|contractor|of|the|for|at|in|on|and|or|to|with|i|ii|iii|iv|v)\b/gi;
        const cleaned = (position || '')
            .replace(/[,\-–—()/]/g, ' ')
            .replace(NOISE, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned
            .split(' ')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    };

    const fallbackKeywordSearch = (kw) => {
        const params = new URLSearchParams();
        params.set('keywords', kw);
        params.set('geoUrn', LINKEDIN_US_GEO_URN);
        params.set('origin', 'GLOBAL_SEARCH_HEADER');
        return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
    };

    // Normalize user-configured alumni school slug to avoid opening
    // placeholder/random LinkedIn school pages.
    const normalizeAlumniSchoolSlug = (rawSlug, rawLabel) => {
        const slug = (rawSlug || '').trim().toLowerCase();
        const label = (rawLabel || '').trim().toLowerCase();
        const placeholderSlugs = new Set([
            '',
            'your-school',
            'your-school-slug',
            'school',
            'school-slug',
            'your-university',
            'your-college'
        ]);
        if (placeholderSlugs.has(slug)) {
            if (label.includes('drexel')) return 'drexel-university';
            return '';
        }
        if (slug === 'drexel' || slug === 'drexel-alumni') return 'drexel-university';
        return slug;
    };

    const buildLinkedInPeopleUrl = ({ companyName, positionName, intent }) => {
        const company = (companyName || '').trim();
        const slug = companyToLinkedInSlug(company);
        const fn = positionToFunction(positionName);

        // Intent: find recruiters / talent acquisition at the target company.
        // The /company/{slug}/people/ page already constrains to actual employees,
        // so we only need a small keyword filter for the title.
        if (intent === 'recruiter') {
            if (slug) {
                const params = new URLSearchParams();
                params.set('keywords', 'recruiter OR talent acquisition OR sourcer');
                return `https://www.linkedin.com/company/${slug}/people/?${params.toString()}`;
            }
            // No company name -> degrade to keyword search with quoted exact-match company.
            return fallbackKeywordSearch(company ? `"${company}" recruiter OR talent acquisition` : 'recruiter OR talent acquisition');
        }

        // Intent: find hiring managers / leadership in the JD's function at the target company.
        if (intent === 'manager') {
            if (slug) {
                const params = new URLSearchParams();
                const titleSeniority = 'manager OR director OR head OR vp';
                const keywords = fn ? `${fn} ${titleSeniority}` : titleSeniority;
                params.set('keywords', keywords);
                return `https://www.linkedin.com/company/${slug}/people/?${params.toString()}`;
            }
            const fallback = fn ? `"${company}" ${fn} manager OR director` : `"${company}" manager OR director`;
            return fallbackKeywordSearch(company ? fallback : 'manager OR director');
        }

        // Intent: find affinity-school alumni currently at the target company.
        // The school slug is loaded from /api/config (profile.json -> networking.alumni_school_slug).
        // The /school/{slug}/people/ page constrains to alumni; we keyword-filter by company.
        // If no school slug is configured, default to Drexel so this button
        // always opens an actual school people page before applying company filter.
        if (intent === 'alumni') {
            const configuredSlug = (APP_CONFIG.alumni && APP_CONFIG.alumni.school_slug) || '';
            const affinityLabel = ((APP_CONFIG.alumni && APP_CONFIG.alumni.label) || 'Drexel Alumni').trim();
            const slugForSchool = normalizeAlumniSchoolSlug(configuredSlug, affinityLabel) || 'drexel-university';
            const params = new URLSearchParams();
            if (company) params.set('keywords', company);
            return `https://www.linkedin.com/school/${encodeURIComponent(slugForSchool)}/people/?${params.toString()}`;
        }

        // Default safety net.
        return fallbackKeywordSearch(company || 'United States');
    };

    // Keep LinkedIn shortcut URLs fresh even when the user skips analysis
    // and manually edits Company/Role in Step 3.
    const refreshLinkedInShortcutUrls = () => {
        const cName = (companyInput && companyInput.value) ? companyInput.value.trim() : '';
        const pName = (positionInput && positionInput.value) ? positionInput.value.trim() : '';
        if (searchAlumniBtn) {
            searchAlumniBtn.href = buildLinkedInPeopleUrl({
                companyName: cName,
                positionName: pName,
                intent: 'alumni'
            });
        }
        if (searchRecruiterBtn) {
            searchRecruiterBtn.href = buildLinkedInPeopleUrl({
                companyName: cName,
                positionName: pName,
                intent: 'recruiter'
            });
        }
        if (searchManagerBtn) {
            searchManagerBtn.href = buildLinkedInPeopleUrl({
                companyName: cName,
                positionName: pName,
                intent: 'manager'
            });
        }
    };

    if (companyInput) {
        companyInput.addEventListener('input', refreshLinkedInShortcutUrls);
        companyInput.addEventListener('change', refreshLinkedInShortcutUrls);
    }
    if (positionInput) {
        positionInput.addEventListener('input', refreshLinkedInShortcutUrls);
        positionInput.addEventListener('change', refreshLinkedInShortcutUrls);
    }
    // Prime hrefs once this helper is initialized.
    setTimeout(refreshLinkedInShortcutUrls, 0);

    // Force-open external search URLs on click so these shortcuts still work
    // even if a stale session left href="#" in the DOM.
    const bindLinkedInShortcutClick = (btn, intent) => {
        if (!btn) return;
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            const url = buildLinkedInPeopleUrl({
                companyName: (companyInput && companyInput.value) ? companyInput.value.trim() : '',
                positionName: (positionInput && positionInput.value) ? positionInput.value.trim() : '',
                intent
            });
            btn.href = url;
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    };
    bindLinkedInShortcutClick(searchAlumniBtn, 'alumni');
    bindLinkedInShortcutClick(searchRecruiterBtn, 'recruiter');
    bindLinkedInShortcutClick(searchManagerBtn, 'manager');

    const safeCard = (obj, fallbackDetails) => ({
        status: (obj && obj.status) ? obj.status : '--',
        details: (obj && obj.details) ? obj.details : fallbackDetails
    });

    const refreshQuotaHealth = async () => {
        if (!quotaHealth) return;
        try {
            const response = await fetch('/api/quota-health');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to read quota health');
            quotaHealth.classList.remove('warn', 'danger');
            const chains = data.chains || {};
            const cfg = data.providers_configured || {};
            // Render only providers that are actually usable, so the chain pill reflects reality.
            const live = (arr) => (arr || []).filter(p => cfg[p] !== false).join('→') || '(none)';
            const used = [
                cfg.groq ? `groq:${data.groq_today || 0}` : null,
                cfg.cerebras ? `cerebras:${data.cerebras_today || 0}` : null,
                cfg.gemini ? `gemini:${data.gemini_today || 0}` : null,
                cfg.github ? `github:${data.github_today || 0}` : null,
                `ollama:${data.ollama_today || 0}`,
            ].filter(Boolean).join(' · ');
            quotaHealth.textContent =
                `Analyze: ${data.analyze_today}/${data.soft_cap} soft (${data.hard_cap} hard) | ` +
                `429 today: ${data.quota_429_today} | ` +
                `Today: ${used} | ` +
                `Chain: ${live(chains.analyze)}`;
            if (data.over_hard) {
                quotaHealth.classList.add('danger');
            } else if (data.over_soft || data.near_soft || data.quota_429_today > 0) {
                quotaHealth.classList.add('warn');
            }
        } catch (error) {
            quotaHealth.classList.remove('warn', 'danger');
            quotaHealth.textContent = `Usage monitor unavailable: ${error.message}`;
        }
    };

    analyzeBtn.addEventListener('click', async () => {
        const jd = jdInput.value.trim();
        if (!jd) {
            alert('Please paste a job description first.');
            return;
        }

        // Update UI
        initialState.classList.add('hidden');
        analysisStep.classList.add('hidden');
        peopleStep.classList.add('hidden');
        draftStep.classList.add('hidden');
        loadingState.classList.remove('hidden');
        analyzeBtn.disabled = true;

        let timeoutId;
        let progressId;
        try {
            const controller = new AbortController();
            // Expose so the "Skip to Outreach" button can cancel a stuck analyze.
            window.__activeAnalyzeController = controller;
            // Backend walks chain: groq→cerebras→gemini→github→ollama. Cloud providers
            // return in 2-5s; Ollama is the only path that can take ~120s, so 240s is
            // a safe ceiling that covers the worst case (full chain with all clouds down).
            const ANALYZE_CLIENT_TIMEOUT_MS = 240000;
            timeoutId = setTimeout(() => controller.abort(), ANALYZE_CLIENT_TIMEOUT_MS);

            // Live progress hint so you can tell it is still working, not stuck.
            const startedAt = Date.now();
            const baseMsg = loadingText.textContent;
            progressId = setInterval(() => {
                const secs = Math.round((Date.now() - startedAt) / 1000);
                let stageHint = '(trying Groq llama-3.3-70b)';
                if (secs >= 8) stageHint = '(Groq slow → trying Cerebras)';
                if (secs >= 16) stageHint = '(trying Gemini fallback)';
                if (secs >= 30) stageHint = '(trying GitHub Models fallback)';
                if (secs >= 45) stageHint = '(local Ollama lifeline — this can take 60-120s)';
                loadingText.textContent = `Running strategic assessment... ${secs}s elapsed ${stageHint}`;
                if (secs >= 55 && !loadingText.dataset.hinted) {
                    loadingText.dataset.hinted = '1';
                }
            }, 1000);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jd }),
                signal: controller.signal
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze');
            }

            // Reset all analysis widgets first so stale values cannot leak across runs.
            sponsorshipStatus.textContent = '--';
            sponsorshipDetails.textContent = 'No sponsorship assessment returned.';
            experienceStatus.textContent = '--';
            experienceDetails.textContent = 'No experience assessment returned.';
            technicalStatus.textContent = '--';
            technicalDetails.textContent = 'No technical assessment returned.';
            domainStatus.textContent = '--';
            domainDetails.textContent = 'No domain assessment returned.';
            locationStatus.textContent = '--';
            locationDetails.textContent = 'No location/pay assessment returned.';
            verdictExperience.textContent = '--/10';
            verdictTech.textContent = '--/10';
            verdictGrowth.textContent = '--/10';
            verdictRec.textContent = '--';
            const provenanceWrapReset = document.getElementById('analysisProvenance');
            if (provenanceWrapReset) provenanceWrapReset.classList.add('hidden');
            const resumePickBadge = document.getElementById('resumePickBadge');
            const resumePickName = document.getElementById('resumePickName');
            const resumePickRationale = document.getElementById('resumePickRationale');
            if (resumePickBadge) resumePickBadge.textContent = '--';
            if (resumePickName) resumePickName.textContent = 'Analyzing persona fit...';
            if (resumePickRationale) resumePickRationale.textContent = 'The model will explain which of your configured resumes best matches this JD and why.';

            // Reset optional cover letter output from any previous run.
            const prevCoverSection = document.getElementById('coverLetterSection');
            const prevCoverText = document.getElementById('coverLetterText');
            const prevCoverProvider = document.getElementById('coverProvider');
            if (prevCoverSection) prevCoverSection.classList.add('hidden');
            if (prevCoverText) prevCoverText.value = '';
            if (prevCoverProvider) prevCoverProvider.textContent = '';

            // Populate base fields
            const cName = data.company || '';
            const pName = data.position || '';
            
            companyInput.value = cName;
            positionInput.value = pName;
            // The analyzer's recommendation drives BOTH the Step-3 "Optimum
            // persona" dropdown AND the Step-4 "Attach" dropdown. The user
            // can still override the attach choice right before sending.
            const recommendedCode = (data.resume_code || 'DS').toUpperCase();
            if (resumeSelect) resumeSelect.value = recommendedCode;
            if (resumeAttach) resumeAttach.value = recommendedCode;
            updateResumeAttachHint();

            // Populate the "Recommended Resume" card on the analysis page.
            const pickedCode = recommendedCode;
            const pickedLabel = RESUME_LABELS[pickedCode] || pickedCode;
            const rationaleText = (data.resume_rationale || '').trim()
                || 'This persona best matches the JD signals detected during analysis.';
            const resumePickBadgeEl = document.getElementById('resumePickBadge');
            const resumePickNameEl = document.getElementById('resumePickName');
            const resumePickRationaleEl = document.getElementById('resumePickRationale');
            if (resumePickBadgeEl) resumePickBadgeEl.textContent = pickedCode;
            if (resumePickNameEl) resumePickNameEl.textContent = `${pickedLabel} resume (${pickedCode})`;
            if (resumePickRationaleEl) resumePickRationaleEl.textContent = rationaleText;
            const suggestedContact = data.suggested_contact || "Talent Acquisition Manager";
            targetPersona.textContent = suggestedContact;
            
            // Build intent-specific LinkedIn URLs with company + US filter hints.
            refreshLinkedInShortcutUrls();

            // Populate Strategy Cards
            const sponsorship = safeCard(data.sponsorship_legal, 'No sponsorship assessment returned.');
            sponsorshipStatus.textContent = sponsorship.status;
            sponsorshipDetails.textContent = sponsorship.details;

            const location = safeCard(data.location_pay, 'No location/pay assessment returned.');
            locationStatus.textContent = location.status;
            locationDetails.textContent = location.details;

            const experience = safeCard(data.experience_seniority, 'No experience assessment returned.');
            experienceStatus.textContent = experience.status;
            experienceDetails.textContent = experience.details;

            const technical = safeCard(data.technical_alignment, 'No technical assessment returned.');
            technicalStatus.textContent = technical.status;
            technicalDetails.textContent = technical.details;

            const domainSource = data.domain_specialty_gap || data.cultural_match;
            const domain = safeCard(domainSource, 'No domain assessment returned.');
            domainStatus.textContent = domain.status;
            domainDetails.textContent = domain.details;

            // Populate Verdict
            const verdict = data.strategic_verdict || {};
            verdictExperience.textContent = verdict.experience_fit || '--/10';
            verdictTech.textContent = verdict.technical_fit || '--/10';
            verdictGrowth.textContent = verdict.growth_fit || '--/10';
            verdictRec.textContent = verdict.recommendation || '--';

            // Fit Score UI
            const score = Number.isFinite(Number(data.fit_score)) ? Number(data.fit_score) : 0;
            fitScoreNum.textContent = `${score}%`;
            extractedRole.textContent = data.position || 'Role Match';
            
            // Set Color based on score
            let color = '#10b981'; // Green
            if (score < 50) color = '#ef4444'; // Red
            else if (score < 75) color = '#f59e0b'; // Orange
            
            fitScoreBox.style.background = `conic-gradient(${color} ${score}%, transparent 0%)`;
            fitScoreNum.style.color = color;

            // Provenance pill — show which AI won the provider chain + latency.
            // Pulled from the `_meta` object the backend now attaches to every
            // /api/analyze response. Helps answer "which AI did this?" at a glance.
            const meta = data._meta || {};
            const provenanceWrap = document.getElementById('analysisProvenance');
            const providerChip = document.getElementById('analysisProviderChip');
            const latencyChip = document.getElementById('analysisLatencyChip');
            if (provenanceWrap && providerChip && latencyChip) {
                if (meta.provider) {
                    const providerLabel = meta.provider.charAt(0).toUpperCase() + meta.provider.slice(1);
                    const modelPart = meta.model && meta.model !== 'unknown' ? ` · ${meta.model}` : '';
                    providerChip.textContent = `${providerLabel}${modelPart}`;
                    const seconds = (meta.latency_ms || 0) / 1000;
                    latencyChip.textContent = seconds >= 0.1 ? `${seconds.toFixed(1)}s` : '—';
                    provenanceWrap.classList.remove('hidden');
                } else {
                    provenanceWrap.classList.add('hidden');
                }
            }

            // Show Analysis Step
            loadingState.classList.add('hidden');
            analysisStep.classList.remove('hidden');

            // Persist the full analysis payload + form state so a page
            // refresh mid-flow (common when drafts hang) doesn't force
            // the user to re-paste the JD.
            cachedAnalysisResult = data;
            saveSession();

        } catch (error) {
            // If the user clicked "Skip to Outreach" and that triggered this
            // abort, stay quiet — they deliberately bailed.
            if (window.__userSkippedAnalysis) {
                loadingState.classList.add('hidden');
            } else {
                const errorMessage = error.name === 'AbortError'
                    ? 'Analysis took longer than 4 minutes and was stopped. Try again, or shorten the JD.'
                    : error.message;
                alert('Error: ' + errorMessage);
                loadingState.classList.add('hidden');
                initialState.classList.remove('hidden');
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            if (progressId) clearInterval(progressId);
            loadingText.textContent = 'Running strategic assessment (experience, stack, domain, pay)...';
            delete loadingText.dataset.hinted;
            analyzeBtn.disabled = false;
            window.__activeAnalyzeController = null;
            refreshQuotaHealth();
        }
    });

    const handleMoveToPeople = () => {
        analysisStep.classList.add('hidden');
        peopleStep.classList.remove('hidden');
        peopleStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        saveSession();
    };
    moveToPeopleBtn.addEventListener('click', handleMoveToPeople);
    // Secondary jump button placed right after the Strategic Verdict table
    // so the user can skip past the optional cover-letter section without
    // scrolling. Uses the same transition logic.
    const jumpToOutreachBtn = document.getElementById('jumpToOutreachBtn');
    if (jumpToOutreachBtn) {
        jumpToOutreachBtn.addEventListener('click', handleMoveToPeople);
    }
    // Escape hatch in Step 1: lets the user jump past analysis entirely when
    // the chain is hanging. Cancels any in-flight analyze so the loading
    // spinner clears. If the JD hasn't been analyzed yet we try a cheap
    // client-side company extraction from the first non-empty lines.
    const jumpToOutreachBtnStep1 = document.getElementById('jumpToOutreachBtnStep1');
    // Heuristic JD parser — purely client-side, no AI call. Used by the
    // Skip-to-Outreach button so the user doesn't have to re-type the company
    // and role when they're bypassing the analyzer. We rely on a handful of
    // patterns that cover ~90% of JDs we've seen in testing:
    //   - Title extracted from "As an X on the Y team", "role of X", or a
    //     Title-Case role token ending in Analyst/Engineer/Manager/etc.
    //   - Company extracted from "At <Company>," / "at <Company>," / NASDAQ
    //     ticker preambles, or the first short non-empty line.
    const extractCompanyAndPositionFromJD = (jdText) => {
        const out = { company: '', position: '' };
        if (!jdText || typeof jdText !== 'string') return out;
        const text = jdText.replace(/\r/g, '');

        // --- Position ---
        // Pattern 1: "As an? <Role> on the <team>"
        let m = text.match(/\bAs an? ([A-Z][A-Za-z0-9 &,.\/-]{2,60}?) (?:on|at|in|with) the /);
        if (m && m[1]) out.position = m[1].trim();
        // Pattern 2: "role of <Role>"
        if (!out.position) {
            m = text.match(/\brole of ([A-Z][A-Za-z0-9 &,.\/-]{2,60}?)[,.\n]/);
            if (m && m[1]) out.position = m[1].trim();
        }
        // Pattern 3: Title-case role tokens ending in a common role noun
        if (!out.position) {
            m = text.match(/\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,4} (?:Analyst|Engineer|Developer|Manager|Scientist|Associate|Specialist|Lead|Designer|Consultant|Director|Architect|Intern|Strategist|Administrator|Operator|Coordinator)(?: I{1,3}| IV| V)?)/);
            if (m && m[1]) out.position = m[1].trim();
        }

        // --- Company ---
        // Pattern 1: "At <Company>," / "at <Company>," at the very start
        m = text.match(/^\s*(?:At|at) ([A-Z][A-Za-z0-9 &.,'\-]{1,60}?)[,\n]/);
        if (m && m[1]) out.company = m[1].trim();
        // Pattern 2: NASDAQ/NYSE ticker preamble
        if (!out.company) {
            m = text.match(/\(NASDAQ:\s*([A-Z]{1,6})\)/);
            if (m && m[1]) out.company = m[1].trim();
        }
        // Pattern 3: "publicly traded ... XXX ... company" scoped mention
        if (!out.company) {
            m = text.match(/\b([A-Z][A-Za-z0-9&. -]{1,40}?) (?:Inc|LLC|Corp|Corporation|Company|Ltd)\.?\b/);
            if (m && m[1]) out.company = m[1].trim();
        }
        // Fallback: first non-empty line that looks like a name (short, Title Case).
        if (!out.company) {
            const firstLine = text.split('\n').map(s => s.trim())
                .find(s => s.length > 0 && s.length <= 60 && /^[A-Z]/.test(s) && !/^(about|the |we |as |your |what|requirements|responsibilities)/i.test(s));
            if (firstLine) out.company = firstLine;
        }
        return out;
    };

    if (jumpToOutreachBtnStep1) {
        jumpToOutreachBtnStep1.addEventListener('click', () => {
            // Cancel the in-flight analyze (if any) so its success/error
            // handlers can't undo this transition mid-jump.
            if (window.__activeAnalyzeController) {
                try { window.__activeAnalyzeController.abort(); } catch (e) {}
                window.__activeAnalyzeController = null;
            }
            // Flag the next few ms so the analyze handler knows not to re-show
            // anything if its abort handler races with our transition.
            window.__userSkippedAnalysis = true;
            setTimeout(() => { window.__userSkippedAnalysis = false; }, 1500);

            const loadingEl = document.getElementById('loading');
            const initialEl = document.getElementById('initial-state');
            const analyzeBtnEl = document.getElementById('analyzeBtn');
            if (loadingEl) loadingEl.classList.add('hidden');
            if (initialEl) initialEl.classList.add('hidden');
            if (analyzeBtnEl) analyzeBtnEl.disabled = false;

            // Auto-populate company + position from the JD so the user lands
            // in Step 3 with fields ready, not a blank form. If the user
            // already typed something there manually, keep their values.
            const companyEl = document.getElementById('company');
            const positionEl = document.getElementById('position');
            const jdEl = document.getElementById('jd');
            if (jdEl && jdEl.value) {
                const parsed = extractCompanyAndPositionFromJD(jdEl.value);
                if (companyEl && !companyEl.value && parsed.company) {
                    companyEl.value = parsed.company;
                }
                if (positionEl && !positionEl.value && parsed.position) {
                    positionEl.value = parsed.position;
                }
            }

            analysisStep.classList.add('hidden');
            peopleStep.classList.remove('hidden');
            peopleStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
            saveSession();
        });
    }

    // --- Cover Letter (on-demand) ---
    const coverLetterBtn = document.getElementById('coverLetterBtn');
    const coverToneSelect = document.getElementById('coverToneSelect');
    const coverLetterLoading = document.getElementById('coverLetterLoading');
    const coverLetterSection = document.getElementById('coverLetterSection');
    const coverLetterText = document.getElementById('coverLetterText');
    const copyCoverBtn = document.getElementById('copyCoverBtn');
    const downloadCoverBtn = document.getElementById('downloadCoverBtn');
    const regenerateCoverBtn = document.getElementById('regenerateCoverBtn');
    const coverProvider = document.getElementById('coverProvider');

    // Title-case + underscore: "Acme Life Sciences" -> "Acme_Life_Sciences"
    const sanitizeForFilename = (text) => {
        const parts = (text || '').match(/[A-Za-z0-9]+/g) || [];
        if (!parts.length) return 'Company';
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('_').slice(0, 80);
    };

    const runCoverLetter = async () => {
        const jd = jdInput.value.trim();
        if (!jd) {
            alert('Please paste a job description and run Deep Strategic Analysis first.');
            return;
        }
        const chosenPersona = promptForPersona('cover letter');
        if (!chosenPersona) return;
        const payload = {
            jd,
            company: companyInput.value.trim() || 'the company',
            position: positionInput.value.trim() || 'the open position',
            resume_code: chosenPersona || resumeSelect.value || 'DS',
            tone: coverToneSelect ? coverToneSelect.value : 'professional'
        };

        coverLetterBtn.disabled = true;
        if (regenerateCoverBtn) regenerateCoverBtn.disabled = true;
        coverLetterLoading.classList.remove('hidden');

        let timeoutId;
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 100000);
            const response = await fetch('/api/cover-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate cover letter');
            }

            coverLetterText.value = data.cover_letter || '';
            if (coverProvider) {
                const provider = data.provider_used || 'unknown';
                const warn = data.warning ? ` — ${data.warning}` : '';
                coverProvider.textContent = `Generated by: ${provider}${warn}`;
            }
            coverLetterSection.classList.remove('hidden');
            coverLetterSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            saveSession();
        } catch (error) {
            const msg = error.name === 'AbortError'
                ? 'Cover letter timed out. Try again or switch tone to Concise.'
                : error.message;
            alert('Error: ' + msg);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            coverLetterLoading.classList.add('hidden');
            coverLetterBtn.disabled = false;
            if (regenerateCoverBtn) regenerateCoverBtn.disabled = false;
            refreshQuotaHealth();
        }
    };

    if (coverLetterBtn) coverLetterBtn.addEventListener('click', runCoverLetter);
    if (regenerateCoverBtn) regenerateCoverBtn.addEventListener('click', runCoverLetter);
    if (chooseCoverPersonaBtn) {
        chooseCoverPersonaBtn.addEventListener('click', () => {
            promptForPersona('cover letter');
        });
    }

    if (copyCoverBtn) {
        copyCoverBtn.addEventListener('click', () => {
            coverLetterText.select();
            document.execCommand('copy');
            const originalText = copyCoverBtn.textContent;
            copyCoverBtn.textContent = '✅ Copied!';
            setTimeout(() => { copyCoverBtn.textContent = originalText; }, 2000);
        });
    }

    // Shared helper: POST cover letter text to a backend endpoint and trigger a download.
    const downloadCoverFile = async (button, endpoint, extension, mimeFallback) => {
        const content = coverLetterText.value || '';
        if (!content.trim()) {
            alert('Nothing to download yet. Generate a cover letter first.');
            return;
        }
        const companyRaw = companyInput.value.trim() || 'Company';
        const companySafe = sanitizeForFilename(companyRaw);
        const filename = `Cover_Letter_${companySafe}.${extension}`;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = `Preparing .${extension}...`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cover_letter: content, company: companyRaw })
            });
            if (!response.ok) {
                let msg = `Failed to build .${extension}`;
                try { const err = await response.json(); msg = err.error || msg; } catch (_) {}
                throw new Error(msg);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('Error: ' + error.message);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    };

    if (downloadCoverBtn) {
        downloadCoverBtn.addEventListener('click', () =>
            downloadCoverFile(downloadCoverBtn, '/api/cover-letter/pdf', 'pdf', 'application/pdf')
        );
    }
    const downloadCoverDocxBtn = document.getElementById('downloadCoverDocxBtn');
    if (downloadCoverDocxBtn) {
        downloadCoverDocxBtn.addEventListener('click', () =>
            downloadCoverFile(
                downloadCoverDocxBtn,
                '/api/cover-letter/docx',
                'docx',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            )
        );
    }

    const getDraftBasePayload = () => ({
        jd: jdInput.value.trim(),
        company: companyInput.value.trim(),
        position: positionInput.value.trim(),
        contact_name: contactNameInput.value.trim(),
        resume_code: resumeSelect.value
    });

    const validateDraftInputs = (payload) => {
        if (!payload.company || !payload.position) {
            alert('Please ensure Company and Identified Role are filled out (run analysis first or edit manually).');
            return false;
        }
        if (!payload.contact_name) {
            alert('Enter the target person\'s name first — the connection note is written for them specifically.');
            return false;
        }
        return true;
    };

    if (draftNoteBtn) {
        draftNoteBtn.addEventListener('click', async () => {
            const payload = getDraftBasePayload();
            const chosenPersona = promptForPersona('connection note');
            if (!chosenPersona) return;
            payload.resume_code = chosenPersona;
            if (!validateDraftInputs(payload)) return;

            draftBtn.disabled = true;
            draftNoteBtn.disabled = true;
            peopleStep.classList.add('hidden');
            draftLoading.classList.remove('hidden');

            try {
                const response = await fetch('/api/connection-note', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to draft connection note');
                }

                connectionNote.value = clipConnectionNote(data.connection_note || '');
                // For note-only flow, leave email fields untouched for speed.
                draftLoading.classList.add('hidden');
                draftStep.classList.remove('hidden');
                draftStep.scrollIntoView({ behavior: 'smooth' });
                saveSession();
            } catch (error) {
                alert('Error: ' + error.message);
                draftLoading.classList.add('hidden');
                peopleStep.classList.remove('hidden');
                saveSession();
            } finally {
                draftBtn.disabled = false;
                draftNoteBtn.disabled = false;
                refreshQuotaHealth();
            }
        });
    }

    draftBtn.addEventListener('click', async () => {
        const payload = getDraftBasePayload();
        const chosenPersona = promptForPersona('email draft');
        if (!chosenPersona) return;
        payload.resume_code = chosenPersona;
        if (!validateDraftInputs(payload)) return;

        draftBtn.disabled = true;
        if (draftNoteBtn) draftNoteBtn.disabled = true;
        peopleStep.classList.add('hidden');
        draftLoading.classList.remove('hidden');

        try {
            const response = await fetch('/api/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to draft email');
            }

            // Populate fields
            connectionNote.value = clipConnectionNote(data.connection_note || '');
            subjectInput.value = data.subject || '';
            bodyInput.value = data.body || '';

            draftLoading.classList.add('hidden');
            draftStep.classList.remove('hidden');

            // Scroll to draft
            draftStep.scrollIntoView({ behavior: 'smooth' });

            saveSession();

        } catch (error) {
            alert('Error: ' + error.message);
            draftLoading.classList.add('hidden');
            peopleStep.classList.remove('hidden');
            // Save even on failure — so if the chain hangs/dies, the user
            // at least keeps the JD, contact name, email, etc. on refresh.
            saveSession();
        } finally {
            draftBtn.disabled = false;
            if (draftNoteBtn) draftNoteBtn.disabled = false;
            refreshQuotaHealth();
        }
    });

    if (chooseDraftPersonaBtn) {
        chooseDraftPersonaBtn.addEventListener('click', () => {
            promptForPersona('email drafting');
        });
    }

    copyNoteBtn.addEventListener('click', () => {
        connectionNote.select();
        document.execCommand('copy');
        
        const originalText = copyNoteBtn.textContent;
        copyNoteBtn.textContent = '✅ Copied!';
        setTimeout(() => {
            copyNoteBtn.textContent = originalText;
        }, 2000);
    });

    sendBtn.addEventListener('click', async () => {
        const recipientEmail = getRecipientEmail();
        // Prefer the Step-4 attach dropdown (the user can override the
        // recommended persona here right before firing). Fall back to the
        // Step-3 dropdown if Step-4 hasn't rendered for some reason.
        const resumeCodeToSend = (resumeAttach && resumeAttach.value) || resumeSelect.value;
        const payload = {
            email: recipientEmail,
            contact_name: contactNameInput.value.trim(),
            company: companyInput.value.trim(),
            position: positionInput.value.trim(),
            resume_code: resumeCodeToSend,
            subject: subjectInput.value.trim(),
            body: bodyInput.value.trim(),
            schedule_next_day_8am: !!(scheduleNextMorning && scheduleNextMorning.checked),
        };

        if (!payload.subject || !payload.body) {
            alert('Draft needs to be generated first.');
            return;
        }
        if (!recipientEmail) {
            alert('Add the recipient email in Step 4 (or Step 3) before firing execution.');
            if (targetEmailInline) targetEmailInline.focus();
            return;
        }

        sendBtn.disabled = true;
        const originalText = sendBtn.textContent;
        sendBtn.textContent = 'Executing Sequence...';

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send');
            }

            // Show success toast
            const scheduled = !!data.scheduled;
            const toastMsg = document.getElementById('toast-msg');
            if (toastMsg) {
                toastMsg.textContent = scheduled
                    ? 'Scheduled for next day 8:00 AM ✅'
                    : 'Execution Successful!';
            }
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 4000);

            sendBtn.textContent = scheduled ? 'Scheduled & Logged! ✅' : 'Sent & Logged! ✅';
            // Do NOT re-enable the exact same text, keep it as sent until looped.

        } catch (error) {
            alert('Error: ' + error.message);
            sendBtn.textContent = originalText;
            sendBtn.disabled = false;
        }
    });

    loopBtn.addEventListener('click', () => {
        // Reset inputs that need to change for the next person
        contactNameInput.value = '';
        targetEmailInput.value = '';
        if (targetEmailInline) targetEmailInline.value = '';
        connectionNote.value = '';
        subjectInput.value = '';
        bodyInput.value = '';
        
        sendBtn.textContent = 'Fire Execution (Email & Log)';
        sendBtn.disabled = false;

        // Hide Step 4, Show Step 3
        draftStep.classList.add('hidden');
        peopleStep.classList.remove('hidden');
        peopleStep.scrollIntoView({ behavior: 'smooth' });
        // Persist the looped state so refreshing mid-loop doesn't dump
        // the user back to Step 1 with a fresh JD.
        saveSession();
    });

    if (agentAskBtn && agentQuestionInput && agentChatLog) {
        agentAskBtn.addEventListener('click', async () => {
            const question = agentQuestionInput.value.trim();
            if (!question) {
                alert('Please type a question for the tracker assistant.');
                return;
            }
            appendAgentMessage('user', question);
            agentQuestionInput.value = '';
            agentAskBtn.disabled = true;
            const originalText = agentAskBtn.textContent;
            agentAskBtn.textContent = 'Thinking...';

            try {
                const response = await fetch('/api/ask', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to get assistant answer');
                }
                appendAgentMessage('assistant', data.answer || 'No answer returned.');
            } catch (error) {
                appendAgentMessage('assistant', `Error: ${error.message}`);
            } finally {
                agentAskBtn.disabled = false;
                agentAskBtn.textContent = originalText;
                refreshQuotaHealth();
            }
        });
    }

    refreshQuotaHealth();
});
