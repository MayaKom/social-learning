/*
 * Experiment timeline.
 * Testing URL parameters (all optional):
 *   ?agent=similar|dissimilar|control  &cb=0..3  &speed=4 (faster animations)
 */
(async function () {
  'use strict';
  const G = window.GridCore;
  const { itemIcon, agentIcon, portrait, AVATARS } = window.GridArt;
  const N_CELLS = CONFIG.agentConditions.length * G.ITEMS.length; // 3 x 4 = 12

  // Every round must have a recording from record.html (js/recordings.js). There is no fallback: if a
  // recording is missing or damaged, the study does not start, so no participant sees anything else.
  function recordingProblems() {
    if (typeof RECORDINGS === 'undefined') return ['js/recordings.js could not be loaded'];
    const problems = [];
    for (const d of STIMULI.demos) {
      const r = RECORDINGS[d.id];
      if (!r) { problems.push(`no recording for round "${d.id}"`); continue; }
      const ev = Array.isArray(r.events) ? r.events : [];
      const last = ev[ev.length - 1];
      if (!ev.length || !last || last.type !== 'collect') problems.push(`the recording for round "${d.id}" is incomplete (it does not end by collecting a resource)`);
    }
    return problems;
  }

  async function main() {
    const missing = recordingProblems();
    if (missing.length) {
      console.error('Study not started:', missing);
      document.body.innerHTML = '<div class="gw-screen gw-text" style="max-width: 640px; margin: 60px auto;">' +
        '<h2>This study is temporarily unavailable</h2>' +
        '<p>Sorry, something went wrong while loading the study. Please return the study on Prolific; you will not be penalized.</p>' +
        '<p class="gw-meta">For the research team: ' + missing.join('; ') + '.</p></div>';
      return;
    }
    window.GridArt.ensureDefs(); // resource artwork must exist before any screen shows a resource
    for (const src of [CONFIG.humanPortrait, CONFIG.humanPortraitSmall]) new Image().src = src; // load Alex's pictures early
    // ---------- Tab switching and pasting (recorded for every screen) ----------
    // focus_lost_count: times the study window lost focus (switching tab or window, or clicking
    // outside the browser); focus_lost_ms: total time away. paste_count / pasted_chars: pastes
    // into any text box on that screen, and how many characters were pasted.
    const track = { lost: 0, lostMs: 0, awaySince: null, pastes: 0, pastedChars: 0 };
    const goAway = () => { if (track.awaySince === null) { track.awaySince = performance.now(); track.lost++; } };
    const comeBack = () => { if (track.awaySince !== null) { track.lostMs += performance.now() - track.awaySince; track.awaySince = null; } };
    window.addEventListener('blur', goAway);
    window.addEventListener('focus', comeBack);
    document.addEventListener('visibilitychange', () => (document.hidden ? goAway() : comeBack()));
    document.addEventListener('paste', e => {
      track.pastes++;
      track.pastedChars += ((e.clipboardData && e.clipboardData.getData('text')) || '').length;
    }, true);

    const jsPsych = initJsPsych({
      show_progress_bar: true,
      message_progress_bar: '',
      on_trial_start: () => { track.lost = 0; track.lostMs = 0; track.pastes = 0; track.pastedChars = 0; },
      on_trial_finish: data => {
        // Time still away at the end of a screen counts towards this screen; counting continues on the next.
        if (track.awaySince !== null) { const now = performance.now(); track.lostMs += now - track.awaySince; track.awaySince = now; }
        Object.assign(data, {
          focus_lost_count: track.lost, focus_lost_ms: Math.round(track.lostMs),
          paste_count: track.pastes, pasted_chars: track.pastedChars
        });
      },
      on_finish: () => { if (CONFIG.saveMethod === 'jatos' && window.jatos) window.jatos.endStudy(); }
    });
    window.jsPsych = jsPsych;
    const urlVar = k => jsPsych.data.getURLVariable(k);

    // ---------- Participant and condition assignment ----------
    const pid = urlVar('PROLIFIC_PID') || jsPsych.randomization.randomID(12);
    const S = {
      // The demonstrator's ID, drawn at random for each participant from demonstratorNames in config.js.
      name: jsPsych.randomization.sampleWithoutReplacement(CONFIG.demonstratorNames || [CONFIG.demonstratorName], 1)[0],
      speed: Number(urlVar('speed')) || 1,
      agent: null, cb: null, conditionIndex: null, assignment: 'random',
      match: null, alexAvatar: CONFIG.neutralAvatar
    };
    let idx = null;
    // Balanced assignment from the server, except for test links that force a condition.
    const testLink = urlVar('agent') !== undefined || urlVar('cb') !== undefined;
    if (CONFIG.assignUrl && !testLink) {
      try { idx = await getBalancedCondition(pid, N_CELLS); S.assignment = 'balanced'; }
      catch (e) { idx = null; S.assignment = 'random_fallback'; /* server unavailable: random below */ }
    }
    if (idx === null && CONFIG.saveMethod === 'datapipe' && CONFIG.useDataPipeConditions) {
      try { const r = await jsPsychPipe.getCondition(CONFIG.datapipeExperimentId); if (Number.isInteger(r)) { idx = r; S.assignment = 'datapipe'; } } catch (e) { /* fall back to random */ }
    }
    if (idx === null) idx = Math.floor(Math.random() * N_CELLS);
    S.conditionIndex = idx;
    const nA = CONFIG.agentConditions.length;
    S.agent = CONFIG.agentConditions[idx % nA];
    S.cb = Math.floor(idx / nA) % G.ITEMS.length;
    if (CONFIG.agentConditions.includes(urlVar('agent'))) { S.agent = urlVar('agent'); S.assignment = 'url'; }
    const cbUrl = Number(urlVar('cb'));
    if (urlVar('cb') !== undefined && urlVar('cb') !== '' && Number.isInteger(cbUrl) && cbUrl >= 0 && cbUrl < G.ITEMS.length) { S.cb = cbUrl; S.assignment = 'url'; }

    const valueMap = Object.fromEntries(G.ROLES.map(r => [G.ROLE_NAMES[r], G.itemName(G.itemFor(r, S.cb))]));
    jsPsych.data.addProperties({
      participant_id: pid, study_id: urlVar('STUDY_ID') || null, session_id: urlVar('SESSION_ID') || null,
      study_version: CONFIG.studyVersion, agent_condition: S.agent, demonstrator_name: S.name,
      counterbalance: S.cb, condition_index: S.conditionIndex, assignment: S.assignment,
      item_best: valueMap.best, item_second: valueMap.second, item_third: valueMap.third, item_worst: valueMap.worst
    });

    // ---------- Text helpers ----------
    const fill = (s, extra = {}) => s.replace(/\{(\w+)\}/g, (m, k) => k === 'name' ? S.name : (k in extra ? extra[k] : m));
    const itemInline = role => { const it = G.itemFor(role, S.cb); return `<span class="gw-inline">${itemIcon(it, 24, false)}${G.itemName(it)}</span>`; };
    const lineup = () => `<div class="gw-lineup">${G.ITEMS.map(i => `<figure>${itemIcon(i, 64, false)}<figcaption>${G.itemName(i)}</figcaption></figure>`).join('')}</div>`;
    const isSimCondition = () => S.agent === 'similar' || S.agent === 'dissimilar';

    // Similarity manipulation, shown on the "Meet Alex" screen (similar and dissimilar conditions).
    function matchHTML() {
      const similar = S.agent === 'similar';
      const how = similar
        ? 'Your partner\u2019s answers matched yours on 4 question(s) out of 5.'
        : 'Your partner\u2019s answers matched yours on 0 question(s) out of 5.';
      // Similar: every answer was the same. Dissimilar: every answer was different (avatar included).
      const avatar = `<span class="gw-inline-avatar">${agentIcon(30, S.alexAvatar, `${S.name}\u2019s avatar`)}</span>`;
      const list = `<ul style="margin: 0 0 12px;">` +
        CONFIG.preferenceItems.map(x => `<li>${x.question}</li>`).join('');
      return `<p>Your partner answered the same five questions about ${CONFIG.topicsText}.</p>` +
        `<p>${how}${similar ? ' Your answers were the same on these questions:' : ' Your answers were different on these questions:'}</p>` +
        list;
    }
    // Default "no profile picture" image: a grey head and shoulders on a light grey circle.
    let picCount = 0;
    const profilePic = size => {
      const id = `gw-pic-${++picCount}`;
      return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="flex-shrink: 0;">` +
        `<defs><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath></defs>` +
        `<g clip-path="url(#${id})"><rect width="64" height="64" fill="#E4E6EA"/>` +
        `<circle cx="32" cy="24" r="11.5" fill="#9AA0AA"/>` +
        `<path d="M10,64 C10,47 20,39 32,39 C44,39 54,47 54,64 Z" fill="#9AA0AA"/></g></svg>`;
    };
    function reminderHTML() {
      if (!CONFIG.showReminder) return '';
      const role = 'Player level: expert';
      return `<div class="gw-reminder">${profilePic(46)}<div><strong>${S.name}</strong><span>${role}</span></div></div>`;
    }
    const header = (title, sub = '', withReminder = false) =>
      `<div class="gw-head"><div><h2>${title}</h2>${sub ? `<p class="gw-sub">${sub}</p>` : ''}</div>${withReminder ? reminderHTML() : ''}</div>`;
    const textScreen = (title, body) => `<div class="gw-screen gw-text"><h2>${title}</h2>${body}</div>`;
    const radios = (name, options) => `<div class="gw-choices">${options.map(o => `<label><input type="radio" name="${name}" value="${o}" required> ${o}</label>`).join('')}</div>`;
    const lastOf = task => jsPsych.data.get().filter({ task }).last(1).values()[0] || {};
    // Comprehension checks follow Prolific's policy: the explanation can be re-read on the check page,
    // participants are told how many attempts they have, and anyone who fails every attempt is asked
    // to return their submission (they cannot be rejected).
    const MAX_ATTEMPTS = CONFIG.comprehensionMaxAttempts;
    const attemptsUsed = task => jsPsych.data.get().filter({ task }).count();
    const failedCheck = task => !lastOf(task).passed;
    const attemptLine = task => `<p class="gw-attempts">Attempt ${attemptsUsed(task) + 1} of ${MAX_ATTEMPTS}.</p>`;
    const reread = html => `<details class="gw-reread"><summary>Read the explanation again</summary>${html}</details>`;
    const retryScreen = (task, label) => ({
      timeline: [{
        type: jsPsychHtmlButtonResponse,
        stimulus: () => {
          const left = MAX_ATTEMPTS - attemptsUsed(task);
          return textScreen('Let\u2019s try that again', '<p>Some of your answers weren\u2019t quite right. Please read the explanation again carefully.</p>' +
            `<p>You have ${left} more attempt${left === 1 ? '' : 's'}.</p>`);
        },
        choices: [label],
        data: { task: task + '_retry' }
      }],
      conditional_function: () => failedCheck(task) && attemptsUsed(task) < MAX_ATTEMPTS
    });

    const timeline = [];

    // ---------- Saving (used at the end, and when a participant fails the comprehension checks) ----------
    const filename = `${pid}_${Date.now()}.csv`;
    function saveNodes() {
      const nodes = [];
      if (CONFIG.saveMethod === 'datapipe') {
        nodes.push({
          type: jsPsychPipe, action: 'save', experiment_id: CONFIG.datapipeExperimentId,
          filename, data_string: () => jsPsych.data.get().csv(),
          wait_message: '<p>Saving your answers. Please don\u2019t close this page.</p>'
        });
      } else if (CONFIG.saveMethod === 'jatos') {
        nodes.push({
          type: jsPsychCallFunction, async: true,
          func: done => { window.jatos.submitResultData(jsPsych.data.get().csv()).then(() => done()).catch(() => done()); }
        });
      } else if (CONFIG.saveMethod === 'server') {
        // Save to the university server; the Prolific IDs come from the study link (see save.js).
        nodes.push({
          type: jsPsychHtmlButtonResponse,
          stimulus: '<div class="gw-screen gw-matching"><div class="gw-spinner" role="progressbar" aria-label="Saving"></div>' +
            '<p class="gw-matching-text">Saving your answers\u2026</p><p>Please don\u2019t close this page.</p></div>',
          choices: [],
          data: { task: 'save' },
          on_load: () => {
            const meta = {
              study: CONFIG.studyName, study_version: CONFIG.studyVersion,
              agent_condition: S.agent, counterbalance: S.cb, participant_id: pid
            };
            saveDataWithRetry(jsPsych.data.get().values(), prolificInfo, meta, CONFIG.saveAttempts)
              .then(res => jsPsych.finishTrial({ save_ok: true, saved_as: res.savedAs }))
              .catch(err => jsPsych.finishTrial({ save_ok: false, save_error: String((err && err.message) || err) }));
          }
        });
        // If saving failed after all attempts, offer a downloaded copy so no data are lost.
        nodes.push({
          timeline: [{
            type: jsPsychHtmlButtonResponse,
            stimulus: textScreen('We couldn\u2019t save your answers',
              '<p>Something went wrong while saving your answers. Please download a copy using the button below, ' +
              'then send it to the researchers through Prolific\u2019s messaging system. You will still be able to complete the study.</p>'),
            choices: ['Download my answers'],
            data: { task: 'save_failed' },
            on_finish: () => jsPsych.data.get().localSave('csv', filename)
          }],
          conditional_function: () => lastOf('save').save_ok === false
        });
      } else if (CONFIG.saveMethod === 'local') {
        nodes.push({ type: jsPsychCallFunction, func: () => jsPsych.data.get().localSave('csv', filename) });
      } // 'none': nothing is saved (preview copies for collaborators)
      return nodes;
    }

    // ---------- Failing a comprehension check after the last attempt ----------
    // Data are saved and marked, then participants are sent back to Prolific through the
    // "request a return" completion path (or, without that link, asked to return the study).
    const failedMessage = () => textScreen('Thank you for your time',
      '<p>Unfortunately, some answers to the check questions were still not correct after ' + MAX_ATTEMPTS + ' attempts, ' +
      'so you can\u2019t continue with this study.</p>' +
      (CONFIG.prolificReturnUrl
        ? '<p>Please click the button below to go back to Prolific, where you will be asked to return your submission.</p>'
        : '<p>Please return your submission on Prolific by clicking \u2018Cancel participation\u2019. You can now close this page.</p>'));
    function comprehensionFailed(task) {
      return {
        timeline: [
          { type: jsPsychCallFunction, func: () => jsPsych.data.addProperties({ comprehension_failed: task }) },
          ...saveNodes(),
          {
            type: jsPsychHtmlButtonResponse,
            stimulus: () => failedMessage(),
            choices: ['Back to Prolific'],
            data: { task: 'comprehension_failed', failed_check: task },
            on_load: () => { if (!CONFIG.prolificReturnUrl) jsPsych.abortExperiment(failedMessage()); },
            on_finish: () => { if (CONFIG.prolificReturnUrl) window.location.href = CONFIG.prolificReturnUrl; }
          }
        ],
        conditional_function: () => failedCheck(task)
      };
    }

    // ---------- Consent ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: textScreen('Consent form', `
        <p class="gw-meta"><strong>Study Title:</strong> Online studies of causal cognition<br>
        <strong>Researcher:</strong> Elizabeth Bonawitz, Ph.D</p>

        <p>Dear Participants,</p>

        <h3>Key Information</h3>
        <p>The following is a short summary of this study to help you decide whether or not to be a part of this study. More detailed information is listed later on in this form.</p>

        <h4>Why am I being invited to take part in a research study?</h4>
        <p>We invite you to take part in a research study because you are among the eligible participants for this study, which includes adults age 18 or older.</p>

        <h4>What should I know about a research study?</h4>
        <ul>
          <li>The research study will be explained to you via online instructions or survey information.</li>
          <li>Whether or not you take part is up to you.</li>
          <li>Your participation is completely voluntary.</li>
          <li>You can choose not to take part.</li>
          <li>You can agree to take part and later change your mind.</li>
          <li>Your decision will not be held against you.</li>
          <li>Your refusal to participate will not result in any consequences or any loss of benefits that you are otherwise entitled to receive.</li>
          <li>You can ask all the questions you want before you decide.</li>
        </ul>

        <h4>Why is this research being done?</h4>
        <p>The purpose of this research is to understand how people are able to learn from their interactions with objects, events, and other people. We are currently studying individuals' learning and development in multiple domains, including causal, visual, language and memory.</p>

        <h4>How long will the research last and what will I need to do?</h4>
        <p>This session will take approximately 10 minutes (including filling out this consent form).</p>
        <p>During the self-guided session, you may be presented with objects or images or watch a video clip and answer questions. There are no "right or wrong" responses to any of these questions—we simply want to find out how people approach objects and situations. Please note that you are NOT being evaluated academically or psychologically, we are simply conducting basic research.</p>

        <h4>Is there any way being in this study could be bad for me?</h4>
        <p>We don't believe there are any risks from participating in this research.</p>

        <h4>Will being in this study help me in any way?</h4>
        <p>There are no benefits to you from your taking part in this research. We cannot promise any benefits to others from your taking part in this research. However, possible benefits to others include furthering the field's understanding of cognitive development.</p>

        <h3>Detailed Information</h3>
        <p>The following is more detailed information about this study in addition to the information listed above.</p>

        <h4>What is the purpose of this research?</h4>
        <p>This research asks four specific questions in learning: (1) How do evidence and prior beliefs interact in children's causal learning? (2) What are the early developmental origins of construing and understanding events? (3) What are learning algorithms that include appropriate cognitive developmental constraints? (4) What is the role of social information in learning? This research examines the cognitive components and learning systems underlying the development and structure of both the response and detection of novel stimuli and the formation and revision of causal belief in humans across the lifespan and how these experiences may change reasoning.</p>

        <h4>What happens if I say yes, but I change my mind later?</h4>
        <p>You can leave the research at any time; it will not be held against you. If you wish to stop, we will end the session without penalty.</p>

        <h4>Audio/Video Recording</h4>
        <p>We will NOT video and/or audio record the session.</p>

        <h4>If I take part in this research, how will my privacy be protected? What happens to the information you collect?</h4>
        <p>Efforts will be made to limit the use and disclosure of your Personal Information, including research participation and information on this form, to people who have a need to review this information. We cannot promise complete secrecy. Organizations that may inspect and copy your information include the IRB and other representatives of this organization. If identifiers are removed from your identifiable private information that is collected during this research, that information could be used for future research studies or distributed to another investigator for future research studies without your additional informed consent.</p>

        <h4>Can I be removed from the research without my OK?</h4>
        <p>The person in charge of the research study or the sponsor can remove you from the research study without your approval. Possible reasons for removal include instances when the participant does not meet the eligibility criteria for the study, which may be determined by their responses to one or more of our questions during the research.</p>

        <h4>What else do I need to know?</h4>
        <p>This research is being funded by the Templeton Foundation, the Caplan Foundation for Early Childhood, NSF, the James F. McDonnell Foundation, the Jacobs Foundation, and funds awarded to Elizabeth Bonawitz from the Harvard Graduate School of Education and the Mind, Brain, and Behavior initiative at Harvard.</p>

        <h4>Compensation</h4>
        <p>If you agree to take part in this research study, you will receive compensation for your time and effort. Amazon Mechanical Turk and Prolific participants will be compensated through their respective platforms.</p>

        <h4>Who can I talk to?</h4>
        <p>If you have questions, concerns, or complaints, you can contact our Principal Investigator, Dr. Elizabeth Bonawitz [<a href="mailto:elizabeth_bonawitz@gse.harvard.edu">elizabeth_bonawitz@gse.harvard.edu</a>].</p>
        <p>This research has been reviewed and approved by the Harvard University Area Institutional Review Board ("IRB"). You may talk to them at (617) 496-2847 or <a href="mailto:cuhs@harvard.edu">cuhs@harvard.edu</a> if:</p>
        <ul>
          <li>Your questions, concerns, or complaints are not being answered by the research team.</li>
          <li>You cannot reach the research team.</li>
          <li>You want to talk to someone besides the research team.</li>
          <li>You have questions about your rights as a research subject.</li>
          <li>You want to get information or provide input about this research.</li>
        </ul>`),
      choices: ['I do NOT consent', 'I consent'],
      // Style the decline button as secondary so the two choices are clearly distinct.
      button_html: (choice, i) => `<button class="jspsych-btn${i === 0 ? ' gw-secondary' : ''}">${choice}</button>`,
      data: { task: 'consent' },
      on_finish: data => {
        data.consented = data.response === 1;
        // Declining ends the study immediately; no further data are collected or saved.
        if (!data.consented) {
          jsPsych.abortExperiment(textScreen('You have chosen not to take part',
            '<p>Thank you for considering this study. You can now close this page.</p>' +
            '<p>If you came from Prolific, please return the study on Prolific.</p>'));
        }
      }
    });

    // ---------- "About you" questions (used for the similarity manipulation) ----------
    const prefItems = CONFIG.preferenceItems;
    const avatarOrder = jsPsych.randomization.shuffle(CONFIG.avatarOptions.slice());
    timeline.push({
      type: jsPsychSurveyHtmlForm,
      preamble: textScreen('A few questions about you', '<p>Before starting the task, please answer a few questions about yourself.</p>' +
        '<p>These questions will be used to match you with another participant, so please be as honest as you can.</p>'),
      html: prefItems.map(it => `<fieldset class="gw-pref"><legend>${it.question}</legend>
        <div class="gw-choices gw-choices-col">${it.options.map(o => `<label><input type="radio" name="${it.id}_choice" value="${o}" required> ${o}</label>`).join('')}</div></fieldset>`).join('') +
        `<fieldset class="gw-pref"><legend>${CONFIG.avatarQuestion}</legend><div class="gw-avatar-choices">${avatarOrder.map(a =>
          `<label><input type="radio" name="avatar_choice" value="${a}" required aria-label="Avatar ${avatarOrder.indexOf(a) + 1}">${agentIcon(56, a)}</label>`).join('')}</div></fieldset>`,
      button_label: 'Continue',
      data: { task: 'preferences', avatar_order: avatarOrder.join('|') },
      on_finish: data => {
        const r = data.response;
        const pAvatar = r.avatar_choice;
        if (S.agent === 'similar') S.alexAvatar = pAvatar;
        else if (S.agent === 'dissimilar') S.alexAvatar = jsPsych.randomization.sampleWithoutReplacement(CONFIG.avatarOptions.filter(a => a !== pAvatar), 1)[0];
        Object.assign(data, { participant_avatar: pAvatar, alex_avatar: S.alexAvatar });
        jsPsych.data.addProperties({ participant_avatar: pAvatar, alex_avatar: S.alexAvatar });
      }
    });

    // ---------- Task explanation and check (repeats until correct) ----------
    const taskExplanation = () =>
      '<p>In this study we are interested in how people learn from watching each other. We taught one group of Prolific participants to play a game called the Gridworld. Once they mastered the game, we recorded their rounds and those recordings are used as teaching videos in this study.</p>' +
      '<p>You will be paired with one of the past participants and watch recordings of them playing. Then, you will play the Gridworld yourself.</p>' +
      '<p><strong>About the Gridworld</strong></p>' +
      '<p>In the Gridworld, there are four kinds of resources: grain, ore, wood and water. Each kind is worth a different number of points.</p>' +
      lineup() +
      '<p>Only one resource can be collected in each round, and every step costs a point. The goal is to collect the most valuable resource available in each round while spending as few points as possible on steps.</p>';
    const taskScreen = {
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen('What you will be doing in this study', taskExplanation()),
      choices: ['Continue'],
      data: { task: 'task_explanation' }
    };
    const RESOURCE_PATTERNS = { grain: /grain|wheat/, ore: /\bores?\b|mineral|rock|metal|iron/, wood: /wood|log|timber/, water: /water/ };
    const taskCheck = {
      type: jsPsychSurveyHtmlForm,
      preamble: () => `<div class="gw-screen gw-text"><h2>Quick check</h2><p>Please answer these questions about the task.</p>${attemptLine('task_check')}${reread(taskExplanation())}</div>`,
      html: `<fieldset class="gw-pref"><legend>How many kinds of resources are there in the Gridworld?</legend>${radios('resource_count', [2, 3, 4, 5, 6])}</fieldset>
        <label class="gw-q" for="gw-resource-names">What are they? Please type their names, separated by commas.</label>
        <input type="text" id="gw-resource-names" name="resource_names" class="gw-text-input" required autocomplete="off">
        <fieldset class="gw-pref gw-gap"><legend>How many resources can be collected in each round?</legend>${radios('per_round', ['One', 'Two', 'As many as you like'])}</fieldset>
        <fieldset class="gw-pref"><legend>What costs points?</legend>${radios('cost', ['Every step', 'Looking around', 'Nothing'])}</fieldset>`,
      button_label: 'Continue',
      data: { task: 'task_check' },
      on_finish: data => {
        const r = data.response, names = (r.resource_names || '').toLowerCase();
        data.resource_count = Number(r.resource_count);
        data.resource_names = r.resource_names;
        data.resource_names_matched = Object.keys(RESOURCE_PATTERNS).filter(k => RESOURCE_PATTERNS[k].test(names)).join(',');
        data.passed = data.resource_count === G.ITEMS.length && Object.values(RESOURCE_PATTERNS).every(re => re.test(names)) &&
          r.per_round === 'One' && r.cost === 'Every step';
      }
    };
    timeline.push({
      timeline: [taskScreen, taskCheck, retryScreen('task_check', 'Read the explanation again')],
      loop_function: () => failedCheck('task_check') && attemptsUsed('task_check') < MAX_ATTEMPTS
    });
    timeline.push(comprehensionFailed('task_check'));

    // ---------- Matching with an expert ----------
    const matchingMs = Math.round(jsPsych.randomization.randomInt(...CONFIG.matchingMs) / S.speed);
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: '<div class="gw-screen gw-matching"><div class="gw-spinner" role="progressbar" aria-label="Loading"></div>' +
        '<p class="gw-matching-text">Matching you with a previous participant\u2026</p></div>',
      choices: [],
      trial_duration: matchingMs,
      data: { task: 'matching', matching_ms: matchingMs }
    });

    // ---------- Demonstrator profile (similarity manipulation) ----------
    // Shown on the "Meet Alex" screen.
    const aboutAlex1 = () =>
      `<p>Your partner in this game (Prolific participant ${S.name}) successfully completed the earlier version of the study and earned a perfect score on the resource-value test, indicating they mastered the game and learned the resource values. You will be watching recordings of their rounds to learn about the Gridworld.</p>`;
    function alexProfile(reminder) {
      return `<div class="gw-profile" style="align-items: flex-start; text-align: left;">` +
        `<div style="align-self: center; margin: 4px 0 12px;">${profilePic(110)}</div>` +
        (reminder ? `<h3 class="gw-card-title">About ${S.name}</h3>` : '') +
        aboutAlex1() +
        (isSimCondition() ? matchHTML() : '') +
        `</div>`;
    }
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen(`Your partner in this game: Prolific participant ${S.name} (ID shortened for anonymity)`, alexProfile(false)),
      choices: ['Continue'],
      data: { task: 'demonstrator_intro' }
    });

    // ---------- Learning from the demonstrator, and check (repeats until correct) ----------
    const learnExplanation = () =>
      `<p>Next, you\u2019ll watch screen recordings of your partner playing the Gridworld. You can learn which resource is the most valuable by watching how your partner collects them. In these rounds, your partner always collects the most valuable resource available.</p>` +
      `<p>In the game, your partner can only see in the direction they are facing, and not through the brick walls. Areas they haven\u2019t seen yet are covered in grey fog, and the fog clears as they explore, so you will see the Gridworld as they discover it.</p>` +
      `<p><strong>After watching the recordings, you\u2019ll collect resources yourself.</strong></p>`;
    const learnScreen = {
      type: jsPsychHtmlButtonResponse,
      // After a failed attempt, the partner's full description is shown again above the explanation.
      stimulus: () => textScreen(`Learning from your partner in this study`, (attemptsUsed('demonstrator_check') > 0 ? alexProfile(false) : '') + learnExplanation()),
      choices: ['Continue'],
      data: { task: 'learning_explanation' }
    };
    const alexQs = () => [
      { name: 'knows', prompt: `What does your partner know?`, options: ['Where all the resources are', 'What each kind of resource is worth', 'Both of these', 'Neither of these'], correct: 'What each kind of resource is worth' },
      { name: 'does', prompt: `What does your partner always do?`, options: ['Collects the closest resource', 'Collects resources at random', 'Collects the most valuable resource available'], correct: 'Collects the most valuable resource available' },
      { name: 'fog', prompt: 'What does the grey fog show?', options: ['Walls no one can walk through', `Areas your partner hasn\u2019t seen yet`, 'Areas with no resources'], correct: `Areas your partner hasn\u2019t seen yet` },
      // Comparison check: the correct answer depends on the condition.
      {
        name: 'match', prompt: 'To make sure you\u2019re paying attention: on which of these \u2018About you\u2019 questions did your answers match your partner\u2019s?',
        options: [...CONFIG.preferenceItems.map(x => x.question), 'Which avatar would you like to play with in this game?', 'All of the above', 'None of the above', 'No comparison was shown to me'],
        correct: S.agent === 'similar' ? 'All of the above' : S.agent === 'dissimilar' ? 'None of the above' : 'No comparison was shown to me'
      }
    ];
    const alexCheck = {
      type: jsPsychSurveyMultiChoice,
      // The re-read panel includes Alex's description (what Alex knows) as well as the learning explanation.
      preamble: () => `<div class="gw-screen gw-text"><h2>Quick check</h2><p>Please answer these questions.</p>${attemptLine('demonstrator_check')}${reread(aboutAlex1() + (isSimCondition() ? matchHTML() : '') + learnExplanation())}</div>`,
      questions: () => alexQs().map(q => ({ name: q.name, prompt: q.prompt, options: q.options, required: true })),
      data: { task: 'demonstrator_check' },
      on_finish: data => {
        const qs = alexQs();
        data.n_correct = qs.filter(q => data.response[q.name] === q.correct).length;
        data.passed = data.n_correct === qs.length;
      }
    };
    timeline.push({
      timeline: [learnScreen, alexCheck, retryScreen('demonstrator_check', 'Read the explanation again')],
      loop_function: () => failedCheck('demonstrator_check') && attemptsUsed('demonstrator_check') < MAX_ATTEMPTS
    });
    timeline.push(comprehensionFailed('demonstrator_check'));

    // ---------- Reminder about Alex, just before the rounds ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen(`Now you will watch the recordings of your partner navigating the Gridworld and collecting resources`,
        `<p>After observing 6 rounds, you\u2019ll collect resources yourself.</p>`
      ),
      choices: ['Start watching'],
      data: { task: 'demonstrator_reminder' }
    });

    // ---------- Demonstrations ----------
    const demos = STIMULI.demos;
    // Alex's rounds are always the recordings made with record.html (checked at the start).
    const recordingFor = id => RECORDINGS[id];
    jsPsych.data.addProperties({ demo_order: demos.map(d => d.id).join('|') });
    demos.forEach((stim, i) => {
      timeline.push({
        type: jsPsychGridDemo,
        stimulus: stim,
        recording: recordingFor(stim.id),
        counterbalance: () => S.cb,
        avatar: () => S.alexAvatar,
        speed: S.speed,
        timing: CONFIG.timing,
        header_html: () => header(`Watch to learn which resource is the most valuable in the Gridworld`, '', true),
        data: { task: 'demo', demo_index: i + 1 }
      });
    });

    // ---------- Test ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen('Your turn',
        `<p>Now you\u2019ll collect resources yourself. Each kind of resource is worth the same as when your partner was collecting.</p>` +
        '<p>In each round, click the resource you want to collect. You\u2019ll walk to it by the shortest route and pick it up. You\u2019ll see your total points at the end.</p>'),
      choices: ['Start'],
      data: { task: 'test_intro' }
    });
    const tests = STIMULI.tests;
    tests.forEach((stim, i) => {
      timeline.push({
        type: jsPsychGridChoice,
        stimulus: stim,
        counterbalance: () => S.cb,
        speed: S.speed,
        timing: CONFIG.testTiming,
        values: CONFIG.values,
        step_cost: CONFIG.stepCost,
        header_html: header('Your turn', `Round ${i + 1} of ${tests.length}`),
        instruction: 'Click the resource you want to collect.',
        button_label: i < tests.length - 1 ? 'Next round' : 'Continue',
        data: { task: 'test', test_index: i + 1 }
      });
    });

    // ---------- Post-test measures ----------
    timeline.push({
      type: jsPsychItemRanking,
      counterbalance: () => S.cb,
      preamble: '<h2>How valuable is each resource?</h2><p>Click the resources in order, from the most valuable to the least valuable.</p>',
      data: { task: 'ranking' }
    });
    (STIMULI.probes || []).forEach(p => {
      timeline.push({
        type: jsPsychGridProbe,
        probe_id: p.id,
        stimulus: demos.find(d => d.id === p.demo),
        agent_cell: p.agentCell, heading: p.heading,
        recording: recordingFor(p.demo),
        counterbalance: () => S.cb,
        avatar: () => S.alexAvatar,
        header_html: () => header(`Thinking about your partner`, 'A moment from one of the rounds'),
        prompt: () => fill(p.prompt, Object.fromEntries(G.ROLES.map(r => [r, itemInline(r)]))),
        correct: 'A',
        data: { task: 'probe' }
      });
    });
    // ---------- Questions about how participants engaged with the study (all required) ----------
    // Three pages, so the open question is answered first and unprompted (and any paste on that page
    // comes from it: see paste_count), and the belief questions come after the ratings.
    const likert = (name, prompt, lo, hi) => `<fieldset class="gw-pref"><legend>${prompt}</legend>
        <div class="gw-scale">${[1, 2, 3, 4, 5, 6, 7].map(v => `<label><input type="radio" name="${name}" value="${v}" required><span>${v}</span></label>`).join('')}</div>
        <div class="gw-scale-ends"><span>${lo}</span><span>${hi}</span></div></fieldset>`;
    const choiceList = (name, prompt, options) => `<fieldset class="gw-pref"><legend>${prompt}</legend>
        <div class="gw-choices gw-choices-col">${options.map(([value, label]) => `<label><input type="radio" name="${name}" value="${value}" required> ${label}</label>`).join('')}</div>`;

    // Page 1: open question
    timeline.push({
      type: jsPsychSurveyHtmlForm,
      preamble: textScreen('A few more questions',
        '<p>Please answer a few questions to help us better understand how you engaged with the study. ' +
        'Your answers won\u2019t affect your payment so please be as honest as you can.</p>'),
      html: `<label class="gw-q" for="gw-q-confusing">Did anything about the study seem confusing, strange, or otherwise in need of change?</label>
        <textarea id="gw-q-confusing" name="q_confusing" rows="4" required></textarea>`,
      button_label: 'Continue',
      data: { task: 'engagement_open' },
      on_finish: data => { data.q_confusing = data.response.q_confusing; }
    });

    // Page 2: ratings and what participants were trying to do
    timeline.push({
      type: jsPsychSurveyHtmlForm,
      preamble: () => textScreen(`About the participant (${S.name})`, ''),
      html: () =>
        likert('q_expert', `How competent was this participant at collecting resources in the Gridworld?`, '1 Not competent at all', '7 Very competent') +
        likert('q_common', `How much do you feel you might have in common with this participant?`, '1 Very little', '7 Very much') +
        likert('q_like', `How much do you think you might like this participant?`, '1 Very little', '7 Very much') +
        likert('q_imagine', `How easy was it to imagine what this participant was thinking?`, '1 Very easy', '7 Very hard') +
        likert('q_human', 'While watching the recordings, how much did it feel like you were watching a real person play?', '1 Not at all', '7 Very much') +
        choiceList('q_aim', `While watching this participant, what were you mainly trying to do?`, [
          ['remember', `Remember which resources the participant picked`],
          ['why', `Work out why the participant did what they did`],
          ['watch', 'Just watch'],
          ['other', 'Other (please explain)']]) +
        `<div class="gw-other" hidden><label class="gw-q" for="gw-q-aim-other">Please explain:</label>
          <input type="text" id="gw-q-aim-other" name="q_aim_other" class="gw-text-input" autocomplete="off"></div></fieldset>`,
      button_label: 'Continue',
      data: { task: 'engagement_ratings' },
      on_load: () => {
        // The explanation box appears, and becomes required, only when "Other" is chosen.
        const box = document.querySelector('.gw-other'), input = document.getElementById('gw-q-aim-other');
        document.querySelectorAll('input[name="q_aim"]').forEach(r => r.addEventListener('change', () => {
          const other = document.querySelector('input[name="q_aim"]:checked').value === 'other';
          box.hidden = !other; input.required = other;
        }));
      },
      on_finish: data => {
        const r = data.response;
        Object.assign(data, {
          q_expert: Number(r.q_expert),
          q_common: Number(r.q_common), q_like: Number(r.q_like),
          q_imagine_hard: Number(r.q_imagine),   // 1 = very easy ... 7 = very hard
          q_human: Number(r.q_human),
          q_aim: r.q_aim, q_aim_other: r.q_aim === 'other' ? r.q_aim_other : null
        });
      }
    });

    // Page 3: memory of the similarity information, and belief in the cover story
    timeline.push({
      type: jsPsychSurveyHtmlForm,
      preamble: () => textScreen(`About the participant (${S.name})`, ''),
      html: () =>
        choiceList('q_real', `Do you think this participant was a real person who had done this task before?`, [
          ['yes', 'Yes'], ['unsure', 'Unsure'], ['no', 'No']]) +
        `<label class="gw-q" for="gw-q-real-explain">Please explain your answer.</label>
          <textarea id="gw-q-real-explain" name="q_real_explain" rows="3" required></textarea></fieldset>`,
      button_label: 'Continue',
      data: { task: 'engagement_beliefs' },
      on_finish: data => {
        const r = data.response;
        Object.assign(data, {
          q_real: r.q_real, q_real_explain: r.q_real_explain
        });
      }
    });

    // ---------- Points earned (shown last, after all the questions) ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => {
        const total = jsPsych.data.get().filter({ task: 'test' }).select('points').sum();
        return textScreen('Your points', `<p>In your rounds, you earned <strong>${total} points</strong>.</p>`);
      },
      choices: ['Continue'],
      data: { task: 'test_summary' }
    });

    // ---------- Save data ----------
    timeline.push(...saveNodes());

    // ---------- Final screen ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: '<div class="gw-screen gw-text gw-thanks"><h2>Thank you!</h2></div>',
      choices: [CONFIG.prolificCompletionUrl ? 'Return to Prolific' : 'Finish'],
      data: { task: 'end' },
      on_finish: () => { if (CONFIG.prolificCompletionUrl) window.location.href = CONFIG.prolificCompletionUrl; }
    });

    jsPsych.run(timeline);
  }

  if (CONFIG.saveMethod === 'jatos' && window.jatos) window.jatos.onLoad(main);
  else main();
})();
