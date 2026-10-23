// Elf Maker's page on Elf Desk, opened from the + page: describe an elf, change what the agent works out, create it,
// read each version before it's published, and ask for changes. Every step that reaches GitHub is a click the desk
// asks you to confirm (Create, Publish, Share).
import {
    LitElement, html, css, shared, markdown, markdownStyles, spinner, ago, calendarText, settingsButton, Ticking, elf,
} from '/elf-kit/1/kit.js';

const KINDS = [
    ['text', 'Text'], ['secret', 'Secret (password, API key)'], ['login', 'GitHub login'], ['repos', 'GitHub repos'],
    ['email', 'Email address'], ['emails', 'Email addresses'], ['words', 'Words'], ['host', 'Host name'], ['int', 'Number'],
    ['bool', 'Yes or no'], ['calendar', 'Schedule'],
];
const WHERE = {
    private: ['Private, in your account', 'Only you can see it and add it.'],
    public: ['Public, in your account', 'Anyone can read it and add it. You can ask House Elves to share it later.'],
    'house-elves': ['Public, in House-elves', 'It goes straight into House Elves, for everyone.'],
};
const STAGES = {
    proposing: ['Working it out', 'run'], proposed: ['Ready to create', 'warn'], building: ['Building', 'run'],
    review: ['Ready to read', 'warn'], published: ['Published', 'ok'], failed: ['Needs you', 'bad'],
};
const MAKE = /^\d{8}-\d{6}\.json$/;

const titleOf = m => m.proposal?.title || (m.description ?? '').split(/\s+/).slice(0, 6).join(' ') || 'New elf';
const linesOf = text => (text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
const short = sha => (sha ?? '').slice(0, 7);
const money = n => (n ? `$${n.toFixed(2)}` : '');

class ElfMaker extends LitElement {

    static properties = {
        _route: { state: true },
        _makes: { state: true },
        _make: { state: true },
        _agent: { state: true },
        _info: { state: true },
        _draft: { state: true },       // the proposal as you edit it
        _dirty: { state: true },
        _busy: { state: true },
        _error: { state: true },
        _done: { state: true },        // what just happened, for the line under the buttons
        _discarding: { state: true },
        _repos: { state: true },
        _installed: { state: true },   // the elves on this desk: [{name, title, repo, commit, version}]       // the elf repos you can push to (undefined: loading, null: failed)
    };

    static styles = [shared, markdownStyles, css`
        .page { display: grid; gap: 26px; }
        h1 { font-size: 34px; line-height: 1.15; font-weight: 600; letter-spacing: -0.022em; }
        h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
        h3 { font-size: 15px; font-weight: 600; margin: 0; }
        .sub { margin: 6px 0 0; color: var(--muted); font-size: 14px; max-width: 46rem; }
        section { display: grid; gap: 12px; }
        .card { padding: 20px 22px; display: grid; gap: 14px; min-width: 0; }
        .hint { margin: 0; font-size: 13.5px; color: var(--muted); max-width: 46rem; }
        .acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        textarea, input[type=text], select {
            box-sizing: border-box; width: 100%; font: inherit; color: var(--ink); background: var(--surface-2);
            border: 1px solid var(--line); border-radius: var(--r-control); padding: 9px 12px;
        }
        textarea, input[type=text], select { font-weight: 400; }
        textarea { resize: vertical; min-height: 5.5rem; line-height: 1.5; }
        textarea.tall { min-height: 12rem; }
        /* Fields keep their own height, whatever the field beside them holds. */
        label.field { display: grid; gap: 6px; font-size: 14px; font-weight: 500; align-content: start; }
        label.field .hint { font-weight: 400; }
        .grid2 { display: grid; grid-template-columns: minmax(0, 18rem) minmax(0, 1fr); gap: 14px; align-items: start; }
        ul.makes { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        ul.makes a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 14px; padding: 14px 18px;
            color: var(--ink); text-decoration: none; }
        ul.makes a:hover { border-color: var(--accent); }
        ul.makes .what { grid-column: 1; font-size: 13.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        ul.makes .chips { grid-row: 1 / span 2; grid-column: 2; align-self: center; }
        .back { font-size: 14px; }
        nav.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
        nav.tabs a { padding: 8px 14px; color: var(--muted); text-decoration: none; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        nav.tabs a.on { color: var(--ink); border-bottom-color: var(--accent); }
        nav.tabs a:hover { color: var(--ink); }
        li.other { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: space-between; padding: 14px 18px; }
        li.other > div { display: grid; gap: 2px; min-width: 0; flex: 1 1 20rem; }
        .empty { color: var(--muted); padding: 16px 18px; margin: 0; }
        .head { display: grid; gap: 6px; }
        .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13.5px; color: var(--muted); align-items: center; }
        .meta a { color: inherit; }
        .working { display: grid; gap: 10px; }
        .working .status { display: inline-flex; gap: 8px; align-items: center; color: var(--accent); font-weight: 500; }
        pre {
            margin: 0; padding: 12px 14px; border-radius: var(--r-control); overflow-x: auto; max-height: 26rem;
            background: var(--log-bg); color: var(--log-ink); font: 12.5px/1.5 var(--font-code); white-space: pre-wrap;
        }
        pre.diff { white-space: pre; }
        .diff .add { color: #7fd99a; } .diff .del { color: #ff8f86; } .diff .at { color: #8fb7ff; } .diff .file { color: #f0c33c; }
        .settings { display: grid; gap: 8px; }
        .setting { display: grid; grid-template-columns: minmax(0, 10rem) minmax(0, 12rem) minmax(0, 12rem) minmax(0, 7rem) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
        .setting input, .setting select { padding: 7px 10px; font-size: 13.5px; }
        fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
        legend { font-size: 14px; font-weight: 500; padding: 0; margin-bottom: 6px; }
        .choice { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: start; font-size: 14px; }
        .choice input { margin-top: 4px; }
        .choice .hint { grid-column: 2; }
        .choice.off { opacity: 0.55; }
        .schedule input[type=text] { max-width: 22rem; }
        .questions { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
        .note { padding: 14px 16px; border-radius: var(--r-control); background: var(--accent-soft); margin: 0; }
        .check-ok { color: var(--ok); font-weight: 600; } .check-bad { color: var(--bad); font-weight: 600; }
        details summary { cursor: pointer; font-size: 14px; color: var(--muted); }
        .history { margin: 0; padding-left: 18px; font-size: 13.5px; color: var(--muted); display: grid; gap: 2px; }
        .confirm { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 14px; padding: 10px 12px;
            border-radius: var(--r-control); background: var(--surface-2); }
        .done { color: var(--ok); font-size: 14px; margin: 0; }
        @media (max-width: 760px) {
            .grid2, .setting { grid-template-columns: minmax(0, 1fr); }
            h1 { font-size: 27px; }
        }
    `];

    constructor() {
        super();
        new Ticking(this);
        this._route = elf.route();
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        elf.act('info').then(i => { this._info = i; }).catch(() => { this._info = { canShareInOrg: false }; });
        this._offChange = elf.onChange(() => this._load());
        this._offRoute = elf.onRoute(r => this._moved(r));
        this._arrive();
    }

    /** Somewhere else in the page: Back or a link (onRoute), or one of its own links (_go, which onRoute doesn't hear). */
    _moved(route) {
        this._route = route;
        this._draft = null;
        this._dirty = false;
        this._done = null;
        this._error = null;
        this._discarding = false;
        this._load();
        this._arrive();
    }

    /** What a place needs when you get there: Your elves lists your repos; change/<owner>/<name> (the + page's Change it) opens that elf. */
    async _arrive() {
        if (this._route === 'mine' && this._repos == null) this._loadRepos();
        const repo = /^change\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})$/.exec(this._route)?.[1];
        if (!repo) return;
        const r = await this._act(`change:${repo}`, 'adopt', { repo });
        if (r?.make) {
            elf.go(`make/${r.make}`, { replace: true });
            this._moved(`make/${r.make}`);
        }
    }

    _go(route) {
        elf.go(route);
        this._moved(route);
    }

    disconnectedCallback() {
        this._offChange?.();
        this._offRoute?.();
        super.disconnectedCallback();
    }

    get _makeId() {
        return /^make\/(\d{8}-\d{6})$/.exec(this._route)?.[1] ?? null;
    }

    async _load() {
        try {
            const files = (await elf.list('makes')).filter(f => MAKE.test(f.name)).map(f => f.name);
            const all = files.length ? await elf.read('makes', files) : {};
            this._makes = Object.values(all).map(t => JSON.parse(t)).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
            // An elf waiting for an agent the runner never started (no report a minute on): back to where it was.
            const stuck = [];
            for (const m of this._makes.filter(x => ['proposing', 'building'].includes(x.stage) && x.agent
                    && Date.now() - Date.parse(x.updated) > 60_000)) {
                if (!(await elf.agent(m.agent))) stuck.push(m.id);
            }
            if (stuck.length) {
                await Promise.all(stuck.map(make => elf.act('settle', { make }).catch(() => {})));
                return this._load();
            }
            this._installed = await elf.installed().catch(() => []);
            const id = this._makeId;
            this._make = id ? this._makes.find(m => m.id === id) ?? null : null;
            const m = this._make;
            if (m && ['proposing', 'building'].includes(m.stage) && m.agent) this._agent = await elf.agent(m.agent);
            else this._agent = null;
            if (m?.stage === 'proposed' && !this._dirty) this._draft = structuredClone(m.proposal);
        } catch (e) {
            this._error = e.message;
        }
    }

    async _act(busy, action, params) {
        this._busy = busy;
        this._error = null;
        this._done = null;
        try {
            return await elf.act(action, params);
        } catch (e) {
            if (!e.cancelled) this._error = e.message;
            // It may have got as far as asking for its agent: if the runner refused that, the elf goes back to where it was.
            const make = params?.make ?? this._makeId;
            if (make && ['propose', 'create', 'revise'].includes(action) && !e.cancelled) {
                await elf.act('settle', { make, why: e.message.slice(0, 500) }).catch(() => {});
                this._load();
            }
            return null;
        } finally {
            this._busy = null;
        }
    }

    // ---- home ----

    async _propose() {
        const description = this.renderRoot.querySelector('#describe').value.trim();
        if (description.length < 10) {
            this._error = 'Say what the elf should do, in a sentence or more.';
            return;
        }
        const r = await this._act('propose', 'propose', { description });
        if (r?.make) {
            this.renderRoot.querySelector('#describe').value = '';
            this._go(`make/${r.make}`);
        }
    }

    async _adopt() {
        const repo = this.renderRoot.querySelector('#adopt').value.trim();
        const r = await this._act('adopt', 'adopt', { repo });
        if (r?.make) this._go(`make/${r.make}`);
    }

    /** The two screens' tabs: Create and Your elves. */
    _tabs(active) {
        const tab = (id, route, label) => html`<a href="#" role="tab" aria-selected=${active === id ? 'true' : 'false'}
            class=${active === id ? 'on' : ''} @click=${e => { e.preventDefault(); this._go(route); }}>${label}</a>`;
        return html`<div class="page-top"><div>
                <h1>Elf Maker</h1>
                <p class="sub">Say what you want an elf to do, or what to change in one you have. Elf Maker works it out and
                    builds it, and you read every version before it's published.</p>
            </div>${settingsButton(null, 'Elf Maker settings')}</div>
            <nav class="tabs" role="tablist" aria-label="Elf Maker">
                ${tab('create', '', 'Create an elf')}${tab('mine', 'mine', 'Your elves')}
            </nav>
            ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : ''}`;
    }

    _create() {
        const working = (this._makes ?? []).filter(m => !m.repo && ['proposing', 'proposed', 'failed'].includes(m.stage));
        return html`
            ${this._tabs('create')}
            <section class="panel card" aria-labelledby="new-h">
                <h2 id="new-h">What should it do?</h2>
                <label class="field"><span class="hint">Describe the job in your own words: what it reads, when, and what you want to see.</span>
                    <textarea id="describe" class="tall" aria-label="What should it do?" placeholder="Every weekday morning, list the new issues in my repos that nobody has answered yet, oldest first, with a link to each."></textarea>
                </label>
                <div class="acts">
                    <button class="primary" ?disabled=${!!this._busy} @click=${this._propose}>
                        ${this._busy === 'propose' ? spinner : ''}Work it out</button>
                    <span class="hint">An agent reads how elves are built and searches the web for what this one needs. It takes
                        a few minutes and only reads; nothing is made yet.</span>
                </div>
            </section>
            ${working.length ? html`<section aria-labelledby="working-h">
                <h2 id="working-h">Not created yet</h2>
                ${this._list(working)}
            </section>` : ''}`;
    }

    _list(makes) {
        return html`<ul class="makes">${makes.map(m => html`<li><a class="panel" href="#" @click=${e => { e.preventDefault(); this._go(`make/${m.id}`); }}>
            <strong>${titleOf(m)}</strong>
            <span class="chips"><span class="chip ${STAGES[m.stage]?.[1] ?? ''}">${STAGES[m.stage]?.[0] ?? m.stage}</span>${this._onDesk(m.repo)
                ? html`<span class="chip ok">On your desk</span>` : ''}</span>
            <span class="what">${m.repo ? `${m.repo}, ` : ''}${m.updated ? `changed ${ago(new Date(m.updated))}` : ''}</span>
        </a></li>`)}</ul>`;
    }

    /** Your elves: the ones made or changed here, and every other elf repo you can push to, to ask for a change. */
    _mine() {
        const makes = (this._makes ?? []).filter(m => m.repo);
        const known = new Set(makes.map(m => m.repo.toLowerCase()));
        const others = (this._repos ?? []).filter(r => !known.has(r.repo.toLowerCase()));
        return html`
            ${this._tabs('mine')}
            ${makes.length ? html`<section aria-labelledby="made-h">
                <h2 id="made-h">Made or changed here</h2>
                ${this._list(makes)}
            </section>` : ''}
            <section aria-labelledby="others-h">
                <h2 id="others-h">${makes.length ? 'Your other elves' : 'Your elves'}</h2>
                <p class="hint">Elf repos tagged house-elf, in your account or House-elves, that you can push to.</p>
                ${this._repos === undefined ? html`<div class="skeleton" style="height:6rem"></div>`
                    : this._repos === null ? html`<p class="error" role="alert">${this._reposError}</p>`
                    : others.length ? html`<ul class="makes">${others.map(r => html`<li class="panel other">
                        <div><strong>${r.repo}</strong>${r.private ? html` <span class="chip">Private</span>` : ''}${this._onDesk(r.repo)
                            ? html` <span class="chip ok">On your desk</span>` : ''}
                            <span class="what">${r.description}</span></div>
                        <button class="sm" ?disabled=${!!this._busy} @click=${() => this._change(r.repo)}>
                            ${this._busy === `change:${r.repo}` ? spinner : ''}Ask for a change</button>
                    </li>`)}</ul>`
                    : html`<p class="panel empty">${makes.length ? 'None besides the ones above.' : 'None yet. Create one, or bring one in below.'}</p>`}
            </section>
            <details>
                <summary>Another repo</summary>
                <div class="card" style="padding:12px 0 0">
                    <label class="field">Its repo
                        <input id="adopt" type="text" placeholder="you/release-notes" autocomplete="off" spellcheck="false">
                        <span class="hint">An elf repo you can push to that isn't listed, such as one just tagged.</span>
                    </label>
                    <div class="acts"><button ?disabled=${!!this._busy} @click=${this._adopt}>${this._busy === 'adopt' ? spinner : ''}Bring it in</button></div>
                </div>
            </details>`;
    }

    /** An elf repo to change: its page here, brought in first if it's new to Elf Maker. */
    async _change(repo) {
        const r = await this._act(`change:${repo}`, 'adopt', { repo });
        if (r?.make) this._go(`make/${r.make}`);
    }

    async _loadRepos() {
        try {
            this._repos = (await elf.act('repos')).repos ?? [];
        } catch (e) {
            this._repos = null;
            this._reposError = `Couldn't list your elves on GitHub: ${e.message}`;
        }
    }

    // ---- one elf ----

    _working(m) {
        const a = this._agent;
        const what = m.stage === 'proposing' ? 'Working it out' : 'Building it';
        const last = (a?.lines ?? []).slice(-8);
        return html`<section class="panel card working" aria-live="polite">
            <span class="status">${spinner}${what}${a?.status === 'queued' ? ' (waiting for the runner)' : ''}${a?.started
                ? `, started ${ago(new Date(a.started))}` : ''}</span>
            <p class="hint">${m.stage === 'proposing'
                ? 'The agent reads the elf guide and the web. You can leave this page; it carries on.'
                : 'The agent builds the elf in a clone of its repo, in the runner\'s sandbox, then the runner checks it. Building takes a while; you can leave this page.'}</p>
            ${last.length ? html`<pre>${last.join('\n')}</pre>` : ''}
            <div class="acts"><button class="quiet" ?disabled=${!!this._busy} @click=${() => this._stop(m)}>Stop</button></div>
        </section>`;
    }

    async _stop(m) {
        this._busy = 'stop';
        try {
            await elf.cancelAgent(m.agent);
        } catch (e) {
            this._error = e.message;
        } finally {
            this._busy = null;
        }
    }

    _set(field, value) {
        this._draft = { ...this._draft, [field]: value };
        this._dirty = true;
    }

    _setSetting(i, field, value) {
        const settings = [...(this._draft.settings ?? [])];
        settings[i] = { ...settings[i], [field]: value };
        this._set('settings', settings);
    }

    async _save(m) {
        const r = await this._act('save', 'save', { make: m.id, proposal: JSON.stringify(this._draft) });
        if (r) {
            this._dirty = false;
            this._draft = r.proposal;
            return true;
        }
        return false;
    }

    async _create(m) {
        if (this._dirty && !(await this._save(m))) return;
        const r = await this._act('create', 'create', { make: m.id });
        if (r) this._load();
    }

    async _rework(m) {
        const notes = this.renderRoot.querySelector('#notes')?.value.trim() ?? '';
        const r = await this._act('rework', 'propose', { make: m.id, description: m.description, notes });
        if (r) {
            this._dirty = false;
            this._load();
        }
    }

    _proposal(m) {
        const d = this._draft ?? m.proposal;
        if (!d) return '';
        const scheduled = !!d.schedule;
        const canOrg = this._info?.canShareInOrg;
        return html`
            ${m.proposalNote ? html`<div class="note md">${markdown(m.proposalNote)}</div>` : ''}
            ${d.questions?.length ? html`<section class="panel card" aria-labelledby="q-h">
                <h2 id="q-h">For you to decide</h2>
                <ul class="questions">${d.questions.map(q => html`<li>${q}</li>`)}</ul>
                <p class="hint">Change the proposal below, or answer them under Work it out again.</p>
            </section>` : ''}
            <section class="panel card" aria-labelledby="p-h">
                <h2 id="p-h">The elf</h2>
                <div class="grid2">
                    <label class="field">Name
                        <input type="text" .value=${d.name ?? ''} @input=${e => this._set('name', e.target.value)} spellcheck="false">
                        <span class="hint">Its repo's name too: lowercase letters, digits and dashes.</span>
                    </label>
                    <label class="field">Title
                        <input type="text" maxlength="30" .value=${d.title ?? ''} @input=${e => this._set('title', e.target.value)}>
                        <span class="hint">Its tab on the desk.</span>
                    </label>
                </div>
                <label class="field">Description
                    <textarea maxlength="300" style="min-height:3.5rem" .value=${d.description ?? ''} @input=${e => this._set('description', e.target.value)}></textarea>
                </label>
                <label class="field">How it will work
                    <textarea class="tall" .value=${d.how ?? ''} @input=${e => this._set('how', e.target.value)}></textarea>
                    <span class="hint">This is what the agent builds from. Markdown.</span>
                </label>
            </section>
            <section class="panel card" aria-labelledby="s-h">
                <h2 id="s-h">What it asks you for</h2>
                <div class="settings">
                    ${(d.settings ?? []).map((s, i) => html`<div class="setting">
                        <input type="text" aria-label="Key" .value=${s.key} @input=${e => this._setSetting(i, 'key', e.target.value.toUpperCase())} spellcheck="false">
                        <input type="text" aria-label="Label" .value=${s.label} @input=${e => this._setSetting(i, 'label', e.target.value)}>
                        <select aria-label="Kind" @change=${e => this._setSetting(i, 'kind', e.target.value)}>
                            ${KINDS.map(([k, label]) => html`<option value=${k} ?selected=${s.kind === k}>${label}</option>`)}
                        </select>
                        <input type="text" aria-label="Default" placeholder=${s.kind === 'secret' ? 'none' : 'Default'} ?disabled=${s.kind === 'secret'}
                            .value=${s.kind === 'secret' ? '' : s.default ?? ''} @input=${e => this._setSetting(i, 'default', e.target.value)}>
                        <input type="text" aria-label="Help" .value=${s.help ?? ''} @input=${e => this._setSetting(i, 'help', e.target.value)}>
                        <button class="quiet sm" aria-label="Remove ${s.label || s.key}" @click=${() => this._set('settings', d.settings.filter((_, j) => j !== i))}>Remove</button>
                    </div>`)}
                </div>
                <div class="acts">
                    <button class="sm" @click=${() => this._set('settings', [...(d.settings ?? []), { key: '', label: '', kind: 'text', help: '' }])}>Add a setting</button>
                    <span class="hint">Key, what the desk shows, its kind, what it starts as, and help. A setting with no default must be filled in before the elf runs. Secrets are written once and never shown.</span>
                </div>
            </section>
            <section class="panel card" aria-labelledby="rw-h">
                <h2 id="rw-h">What it reads and writes</h2>
                <p class="hint">One per line. The desk shows these before anyone adds it, so they must be true.</p>
                <div class="grid2" style="grid-template-columns:repeat(2, minmax(0, 1fr))">
                    <label class="field">Reads
                        <textarea .value=${(d.reads ?? []).join('\n')} @input=${e => this._set('reads', linesOf(e.target.value))}></textarea>
                    </label>
                    <label class="field">Writes
                        <textarea .value=${(d.writes ?? []).join('\n')} @input=${e => this._set('writes', linesOf(e.target.value))}></textarea>
                    </label>
                </div>
            </section>
            <section class="panel card schedule" aria-labelledby="w-h">
                <h2 id="w-h">When it runs, and where it lives</h2>
                <fieldset>
                    <legend>When it runs</legend>
                    <label class="choice"><input type="radio" name="when" ?checked=${scheduled}
                        @change=${() => this._set('schedule', m.proposal?.schedule || 'Mon..Fri *-*-* 07:00')}>
                        <span>On its own${scheduled && calendarText(d.schedule) ? `, ${calendarText(d.schedule)}` : ''}</span></label>
                    ${scheduled ? html`<input type="text" aria-label="Schedule" .value=${d.schedule} @input=${e => this._set('schedule', e.target.value)} spellcheck="false">` : ''}
                    <label class="choice"><input type="radio" name="when" ?checked=${!scheduled} @change=${() => this._set('schedule', '')}>
                        <span>Only when you start it</span></label>
                    ${d.scheduleWhy ? html`<p class="hint">${d.scheduleWhy}</p>` : ''}
                </fieldset>
                <fieldset>
                    <legend>Where it lives</legend>
                    ${Object.entries(WHERE).map(([k, [label, hint]]) => {
                        const off = k === 'house-elves' && !canOrg;
                        return html`<label class="choice ${off ? 'off' : ''}"><input type="radio" name="where" ?checked=${d.where === k}
                            ?disabled=${off} @change=${() => this._set('where', k)}>
                            <span>${label}</span><span class="hint">${off ? 'Only House-elves\' owners can put elves there. Choose public in your account, then share it.' : hint}</span></label>`;
                    })}
                    <p class="hint">Its repo starts out private either way. It's made public when you publish it.</p>
                </fieldset>
            </section>
            <div class="acts">
                <button class="primary" ?disabled=${!!this._busy} @click=${() => this._create(m)}>
                    ${this._busy === 'create' ? spinner : ''}Create ${d.title || 'it'}</button>
                ${this._dirty ? html`<button ?disabled=${!!this._busy} @click=${() => this._save(m)}>
                    ${this._busy === 'save' ? spinner : ''}Keep my changes</button>` : ''}
                <span class="hint">Creates a private repo for it on GitHub, and an agent builds it there.</span>
            </div>
            <details>
                <summary>Work it out again</summary>
                <div class="card" style="padding:12px 0 0">
                    <label class="field">What should change?
                        <textarea id="notes" placeholder="It should also cover my organisation's repos, and run at 8."></textarea>
                    </label>
                    <div class="acts"><button ?disabled=${!!this._busy} @click=${() => this._rework(m)}>
                        ${this._busy === 'rework' ? spinner : ''}Work it out again</button>
                        <span class="hint">The agent starts from its last proposal${this._dirty ? ', not your changes above' : ''}.</span></div>
                </div>
            </details>`;
    }

    _patch(patch) {
        return html`<pre class="diff">${(patch ?? '').split('\n').map(l => {
            const c = l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff --git') ? 'file'
                : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'at' : '';
            return html`<span class=${c}>${l}</span>\n`;
        })}</pre>`;
    }

    async _recheck(m) {
        if (await this._act('recheck', 'recheck', { make: m.id })) this._load();
    }

    async _publish(m) {
        const r = await this._act('publish', 'publish', { make: m.id, commit: m.build.to });
        if (!r) return;
        if (r.push?.status !== 200) {
            this._error = `It wasn't pushed: ${r.push?.error ?? 'the runner didn\'t say why'}.`;
            return;
        }
        const p = await this._act('publish', 'published', { make: m.id });
        if (p) {
            this._done = `Published${p.version?.version ? ` version ${p.version.version}` : ''}.`;
            this._load();
        }
    }

    async _revise(m, id) {
        const field = this.renderRoot.querySelector(`#${id}`);
        const request = field?.value.trim() ?? '';
        if (request.length < 3) {
            this._error = 'Say what to change.';
            return;
        }
        const r = await this._act('revise', 'revise', { make: m.id, request });
        if (r) {
            field.value = '';
            this._load();
        }
    }

    _ask(m, id, label, placeholder) {
        return html`<section class="panel card" aria-labelledby="${id}-h">
            <h2 id="${id}-h">${label}</h2>
            <label class="field">What should change?
                <textarea id=${id} placeholder=${placeholder}></textarea>
            </label>
            <div class="acts"><button ?disabled=${!!this._busy} @click=${() => this._revise(m, id)}>
                ${this._busy === 'revise' ? spinner : ''}Ask for the change</button>
                <span class="hint">The agent changes it in its clone, and you read it again before it's published.</span></div>
        </section>`;
    }

    _review(m) {
        const b = m.build;
        const commit = b.commits?.[0];
        const first = !(m.published ?? []).length;
        return html`
            ${b.note ? html`<div class="note md">${markdown(b.note)}</div>` : ''}
            <section class="panel card" aria-labelledby="r-h">
                <h2 id="r-h">${first ? 'The first version' : 'The new version'}</h2>
                ${b.summary ? html`<div class="md">${markdown(b.summary)}</div>` : ''}
                ${commit ? html`<p class="hint">Commit <code>${short(b.to)}</code>: ${commit.subject}</p>` : ''}
                <h3>The runner's check</h3>
                <p class=${b.checked ? 'check-ok' : 'check-bad'}>${b.checked ? 'It installs, and carries no tokens or keys.' : 'It doesn\'t pass yet.'}</p>
                ${b.checkOut ? html`<pre>${b.checkOut}</pre>` : ''}
                ${b.checked ? '' : html`<div class="acts"><button class="sm" ?disabled=${!!this._busy} @click=${() => this._recheck(m)}>
                    ${this._busy === 'recheck' ? spinner : ''}Check it again</button></div>`}
                ${b.tried ? html`<h3>How the agent tried it</h3><div class="md">${markdown(b.tried)}</div>` : ''}
                ${b.settingsToTry ? html`<h3>To try it</h3><div class="md">${markdown(b.settingsToTry)}</div>` : ''}
                <details ?open=${!first}>
                    <summary>The code (${b.diffstat ? linesOf(b.diffstat).at(-1) : 'the change'})</summary>
                    <p class="hint" style="margin:10px 0">This is what will run on your machine, as you, once you add it.</p>
                    ${this._patch(b.patch)}
                </details>
            </section>
            <div class="acts">
                <button class="primary" ?disabled=${!!this._busy || !b.checked} @click=${() => this._publish(m)}>
                    ${this._busy === 'publish' ? spinner : ''}Publish this version</button>
                <span class="hint">${m.proposal?.where === 'private' ? `Pushes it to ${m.repo}, which stays private.`
                    : `Pushes it to ${m.repo}, and makes the repo public.`}</span>
            </div>
            ${this._ask(m, 'change', 'Not right yet?', 'The card should say how many are new since yesterday, not in all.')}`;
    }

    /** The elf from this repo on your desk, if it's there. */
    _onDesk(repo) {
        return (this._installed ?? []).find(e => (e.repo ?? '').toLowerCase() === (repo ?? '').toLowerCase()) ?? null;
    }

    async _remove(e) {
        this._busy = 'remove';
        this._error = null;
        try {
            await elf.removeElf(e.name);
            this._done = `${e.title} is off your desk. Its settings stay, for if you add it again.`;
            this._load();
        } catch (err) {
            if (!err.cancelled) this._error = err.message;
        } finally {
            this._busy = null;
        }
    }

    _published(m) {
        const v = (m.published ?? []).at(-1);
        const desk = this._onDesk(m.repo);
        // Brought in from outside and not changed here yet: its version is GitHub's, not one published from here.
        const broughtIn = m.adopted && (m.published ?? []).length === 1;
        const own = m.repo && !m.repo.startsWith('House-elves/');
        const isPublic = m.proposal?.where !== 'private';
        return html`
            <section class="panel card" aria-labelledby="pub-h">
                <h2 id="pub-h">${broughtIn ? (v?.version ? `At version ${v.version}` : 'As it is on GitHub')
                    : v?.version ? `Version ${v.version} is published` : 'Published'}</h2>
                <p class="hint">On GitHub at <a href="https://github.com/${m.repo}" target="_blank" rel="noopener">${m.repo}</a>, at
                    <code>${short(v?.commit)}</code>${v?.at && !broughtIn ? `, ${ago(new Date(v.at))}` : ''}.
                    ${!desk ? (m.adopted ? 'It isn\'t on your desk.' : 'Add it to your desk to try it; a later version shows as an update on its tab.')
                        : desk.commit === v?.commit ? `It's on your desk${desk.version ? ` (version ${desk.version})` : ''}.`
                        : `Your desk has ${desk.version ? `version ${desk.version}` : 'an older version'}: update it to try this one.`}</p>
                <div class="acts">
                    ${!desk ? html`<button class="primary" ?disabled=${!!this._busy} @click=${() => this._add(m)}>Add it to your desk</button>`
                        : html`${desk.commit !== v?.commit ? html`<button class="primary" ?disabled=${!!this._busy} @click=${() => this._add(m)}>
                                Update it on your desk</button>` : ''}
                            <button ?disabled=${!!this._busy} @click=${() => elf.openElf(desk.name).catch(err => { this._error = err.message; })}>Open it</button>
                            <button class="quiet danger" ?disabled=${!!this._busy} @click=${() => this._remove(desk)}>
                                ${this._busy === 'remove' ? spinner : ''}Remove it from your desk</button>`}
                    ${own && isPublic && !m.shareIssue ? html`<button ?disabled=${!!this._busy} @click=${() => this._share(m)}>
                        ${this._busy === 'share' ? spinner : ''}Share with House Elves</button>` : ''}
                    ${m.shareIssue ? html`<a href=${m.shareIssue}>Your request to share it</a>` : ''}
                </div>
                ${own && isPublic && !m.shareIssue ? html`<p class="hint">Sharing opens an issue in House-elves/house-elves. If
                    they take it, the repo moves there and the elf is listed for everyone.</p>` : ''}
            </section>
            ${this._ask(m, 'change', 'Ask for a change', 'Also show the issues nobody answered in my organisation\'s repos.')}`;
    }

    async _add(m) {
        try {
            await elf.addElf(m.repo);
        } catch (e) {
            this._error = e.message;
        }
    }

    async _share(m) {
        const r = await this._act('share', 'share', { make: m.id });
        if (r?.issue) this._load();
    }

    async _discard(m) {
        const r = await this._act('discard', 'discard', { make: m.id });
        if (r) {
            this._discarding = false;
            this._repos = undefined;
            this._go(m.repo ? 'mine' : '');
        }
    }

    _one(m) {
        const [stage, tone] = STAGES[m.stage] ?? [m.stage, ''];
        return html`
            <a class="back" href="#" @click=${e => { e.preventDefault(); this._go(m.repo ? 'mine' : ''); }}>${m.repo ? 'Your elves' : 'Create an elf'}</a>
            <div class="head">
                <h1>${titleOf(m)}</h1>
                <div class="meta">
                    <span class="chip ${tone}">${stage}</span>
                    ${m.repo ? html`<a href="https://github.com/${m.repo}" target="_blank" rel="noopener">${m.repo}</a>` : ''}
                    ${m.cost ? html`<span>AI ${money(m.cost)} so far</span>` : ''}
                </div>
                ${m.description && m.stage !== 'published' ? html`<p class="sub">You asked: ${m.description}</p>` : ''}
            </div>
            ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : ''}
            ${this._done ? html`<p class="done" role="status">${this._done}</p>` : ''}
            ${m.error ? html`<p class="error" role="alert">${m.error}</p>` : ''}
            ${['proposing', 'building'].includes(m.stage) ? this._working(m)
                : m.stage === 'proposed' ? this._proposal(m)
                : m.stage === 'review' && m.build ? this._review(m)
                : m.stage === 'published' ? this._published(m)
                : m.stage === 'failed' ? this._failed(m) : ''}
            ${m.history?.length ? html`<details>
                <summary>What happened so far</summary>
                <ul class="history">${[...m.history].reverse().map(h => html`<li>${ago(new Date(h.at))}: ${h.what}</li>`)}</ul>
            </details>` : ''}
            ${['proposing', 'building'].includes(m.stage) ? '' : this._discarding
                ? html`<div class="confirm" role="group" aria-label="Forget ${titleOf(m)}">
                    Forget ${titleOf(m)} here?${m.adopted ? ` Nothing changes on GitHub, and it stays under Your elves.`
                        : m.repo ? ` Its repo stays on GitHub (${m.repo}): delete it there if you don't want it.` : ''}
                    <button class="sm danger" ?disabled=${!!this._busy} @click=${() => this._discard(m)}>Forget it</button>
                    <button class="sm quiet" @click=${() => { this._discarding = false; }}>Keep it</button></div>`
                : html`<div class="acts"><button class="quiet sm" @click=${() => { this._discarding = true; }}>Forget it</button></div>`}`;
    }

    _failed(m) {
        if (!m.repo) {
            return html`<div class="acts"><button class="primary" ?disabled=${!!this._busy} @click=${() => this._rework(m)}>
                ${this._busy === 'rework' ? spinner : ''}Work it out again</button></div>`;
        }
        return this._ask(m, 'change', 'Try again', 'Build it as proposed.');
    }

    render() {
        const id = this._makeId;
        return html`<div class="page">
            ${!this._makes ? html`<div class="skeleton" style="height:40vh"></div>`
                : id ? (this._make ? this._one(this._make) : html`<p class="panel card">That elf isn't here any more.
                    <a href="#" @click=${e => { e.preventDefault(); this._go('mine'); }}>Your elves</a></p>`)
                : this._route.startsWith('change/') ? (this._error ? html`${this._tabs('mine')}`
                    : html`<p class="panel card working"><span class="status">${spinner}Opening ${this._route.slice(7)}…</span></p>`)
                : this._route === 'mine' ? this._mine() : this._create()}
        </div>`;
    }
}

customElements.define('elf-maker', ElfMaker);
document.body.append(document.createElement('elf-maker'));
