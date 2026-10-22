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

  async function main() {
    window.GridArt.ensureDefs(); // resource artwork must exist before any screen shows a resource
    for (const src of [CONFIG.humanPortrait, CONFIG.humanPortraitSmall]) new Image().src = src; // load Alex's pictures early
    const jsPsych = initJsPsych({
      show_progress_bar: true,
      message_progress_bar: '',
      on_finish: () => { if (CONFIG.saveMethod === 'jatos' && window.jatos) window.jatos.endStudy(); }
    });
    window.jsPsych = jsPsych;
    const urlVar = k => jsPsych.data.getURLVariable(k);

    // ---------- Participant and condition assignment ----------
    const pid = urlVar('PROLIFIC_PID') || jsPsych.randomization.randomID(12);
    const S = {
      name: CONFIG.demonstratorName,
      speed: Number(urlVar('speed')) || 1,
      agent: null, cb: null, conditionIndex: null, assignment: 'random',
      match: null, alexAvatar: CONFIG.neutralAvatar
    };
    let idx = null;
    if (CONFIG.saveMethod === 'datapipe' && CONFIG.useDataPipeConditions) {
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
      study_version: CONFIG.studyVersion, agent_condition: S.agent,
      counterbalance: S.cb, condition_index: S.conditionIndex, assignment: S.assignment,
      item_best: valueMap.best, item_second: valueMap.second, item_third: valueMap.third, item_worst: valueMap.worst
    });

    // ---------- Text helpers ----------
    const fill = (s, extra = {}) => s.replace(/\{(\w+)\}/g, (m, k) => k === 'name' ? S.name : (k in extra ? extra[k] : m));
    const itemInline = role => { const it = G.itemFor(role, S.cb); return `<span class="gw-inline">${itemIcon(it, 24, false)}${G.itemName(it)}</span>`; };
    const lineup = () => `<div class="gw-lineup">${G.ITEMS.map(i => `<figure>${itemIcon(i, 64, false)}<figcaption>${G.itemName(i)}</figcaption></figure>`).join('')}</div>`;
    const isSimCondition = () => S.agent === 'similar' || S.agent === 'dissimilar';
    // Expert description: identical in every condition.
    const expertText = () => `${S.name} knows exactly what each kind of resource is worth and always collects the most valuable resource available.`;

    // Similarity manipulation, shown on the "Meet Alex" screen (similar and dissimilar conditions).
    function matchHTML() {
      const it = CONFIG.preferenceItems.find(x => x.id === S.match.item);
      const similar = S.agent === 'similar';
      const how = similar ? `and ${S.name}\u2019s answers were very similar to yours` : `but ${S.name}\u2019s answers were very different from yours`;
      const feels = similar ? `${S.name} feels the same about ${it.topic}` : `${S.name} feels very differently about ${it.topic}`;
      return `<p><strong>${S.name} answered the same questions about ${CONFIG.topicsText}, ${how}. For example, ${feels}, ` +
        `and ${S.name}\u2019s favorite avatar is ${similar ? 'also ' : ''}<span class="gw-inline-avatar">${agentIcon(30, S.alexAvatar, 'Alex\u2019s favorite avatar')}</span>.</strong></p>`;
    }
    function reminderHTML() {
      if (!CONFIG.showReminder) return '';
      const role = 'Expert collector';
      return `<div class="gw-reminder"><img class="gw-reminder-pic" src="${CONFIG.humanPortraitSmall}" alt="" width="46"><div><strong>${S.name}</strong><span>${role}</span></div></div>`;
    }
    const header = (title, sub = '', withReminder = false) =>
      `<div class="gw-head"><div><h2>${title}</h2>${sub ? `<p class="gw-sub">${sub}</p>` : ''}</div>${withReminder ? reminderHTML() : ''}</div>`;
    const textScreen = (title, body) => `<div class="gw-screen gw-text"><h2>${title}</h2>${body}</div>`;
    const radios = (name, options) => `<div class="gw-choices">${options.map(o => `<label><input type="radio" name="${name}" value="${o}" required> ${o}</label>`).join('')}</div>`;
    const lastOf = task => jsPsych.data.get().filter({ task }).last(1).values()[0] || {};
    const retryScreen = (task, label) => ({
      timeline: [{
        type: jsPsychHtmlButtonResponse,
        stimulus: textScreen('Let\u2019s try that again', '<p>Some of your answers weren\u2019t quite right. Please read the explanation again carefully.</p>'),
        choices: [label],
        data: { task: task + '_retry' }
      }],
      conditional_function: () => !lastOf(task).passed
    });

    const timeline = [];

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
        <p>This session will take approximately 20 minutes (including filling out this consent form).</p>
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
      preamble: textScreen('A few questions about you', '<p>Before starting the task, please answer a few questions about yourself.</p>'),
      html: prefItems.map(it => `<fieldset class="gw-pref"><legend>${it.question}</legend>
          <select name="${it.id}_choice" required><option value="" selected disabled>Choose one</option>${it.options.map(o => `<option>${o}</option>`).join('')}</select>
          <p class="gw-pref-imp">${it.importance}</p>
          <div class="gw-scale">${[1, 2, 3, 4, 5, 6, 7].map(v => `<label><input type="radio" name="${it.id}_importance" value="${v}" required><span>${v}</span></label>`).join('')}</div>
          <div class="gw-scale-ends"><span>Not at all important</span><span>Extremely important</span></div></fieldset>`).join('') +
        `<fieldset class="gw-pref"><legend>${CONFIG.avatarQuestion}</legend><div class="gw-avatar-choices">${avatarOrder.map(a =>
          `<label><input type="radio" name="avatar_choice" value="${a}" required aria-label="Avatar ${avatarOrder.indexOf(a) + 1}">${agentIcon(56, a)}</label>`).join('')}</div></fieldset>`,
      button_label: 'Continue',
      data: { task: 'preferences', avatar_order: avatarOrder.join('|') },
      on_finish: data => {
        const r = data.response;
        // The topic with the most extreme importance rating (furthest from the midpoint); ties,
        // including all four rated the same, are broken at random.
        const ext = it => Math.abs(Number(r[it.id + '_importance']) - 4);
        const maxExt = Math.max(...prefItems.map(ext));
        const it = jsPsych.randomization.sampleWithoutReplacement(prefItems.filter(x => ext(x) === maxExt), 1)[0];
        const rating = Number(r[it.id + '_importance']);
        const pAvatar = r.avatar_choice;
        S.match = { item: it.id, rating };
        if (S.agent === 'similar') S.alexAvatar = pAvatar;
        else if (S.agent === 'dissimilar') S.alexAvatar = jsPsych.randomization.sampleWithoutReplacement(CONFIG.avatarOptions.filter(a => a !== pAvatar), 1)[0];
        Object.assign(data, {
          participant_avatar: pAvatar, alex_avatar: S.alexAvatar,
          match_item: isSimCondition() ? it.id : null, match_participant_rating: isSimCondition() ? rating : null
        });
        jsPsych.data.addProperties({ participant_avatar: pAvatar, alex_avatar: S.alexAvatar });
      }
    });

    // ---------- Task explanation and check (repeats until correct) ----------
    const taskScreen = {
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen('The Gridworld',
        '<p>In this task, you will be exploring the Gridworld.</p>' +
        '<p>In the Gridworld, there are four kinds of resources: grain, ore, wood and water. Each kind is worth a different number of points.</p>' +
        lineup() +
        '<p>Only one resource can be collected in each round, and every step costs a point. The goal is to collect the most valuable resource while spending as few points as possible on steps.</p>'),
      choices: ['Continue'],
      data: { task: 'task_explanation' }
    };
    const RESOURCE_PATTERNS = { grain: /grain|wheat/, ore: /\bores?\b|mineral|rock|metal|iron/, wood: /wood|log|timber/, water: /water/ };
    const taskCheck = {
      type: jsPsychSurveyHtmlForm,
      preamble: '<div class="gw-screen gw-text"><h2>Quick check</h2><p>Please answer these questions about the task.</p></div>',
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
      loop_function: () => !lastOf('task_check').passed
    });

    // ---------- Matching with an expert (makes the human demonstrator believable) ----------
    const matchingMs = Math.round(jsPsych.randomization.randomInt(...CONFIG.matchingMs) / S.speed);
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: '<div class="gw-screen gw-matching"><div class="gw-spinner" role="progressbar" aria-label="Loading"></div>' +
        '<p class="gw-matching-text">Matching you with an expert on the Gridworld\u2026</p></div>',
      choices: [],
      trial_duration: matchingMs,
      data: { task: 'matching', matching_ms: matchingMs }
    });
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: '<div class="gw-screen gw-matching"><div class="gw-match-found" aria-hidden="true">\u2713</div>' +
        '<p class="gw-matching-text">Match found</p></div>',
      choices: [],
      trial_duration: Math.round(CONFIG.matchFoundMs / S.speed),
      data: { task: 'match_found' }
    });

    // ---------- Demonstrator profile (similarity manipulation) ----------
    // Shown on the "Meet Alex" screen and again just before the rounds (`reminder`).
    function alexProfile(reminder) {
      return `<div class="gw-profile">` +
        `<img class="gw-portrait" src="${CONFIG.humanPortrait}" alt="" width="120">` +
        (reminder ? `<h3 class="gw-card-title">About ${S.name}</h3>` : '') +
        `<p>${S.name} has done this task many times and over the last 20 trials has collected the maximum number of points every time.</p>` +
        (isSimCondition() ? matchHTML() : '') +
        `<p>${expertText()}</p></div>`;
    }
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen(`Meet ${S.name} (name changed for anonymity)`, alexProfile(false)),
      choices: ['Continue'],
      data: { task: 'demonstrator_intro' }
    });

    // ---------- Learning from the demonstrator, and check (repeats until correct) ----------
    const learnScreen = {
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen(`Learning from ${S.name}`,
        `<p>Next, you\u2019ll watch ${S.name} collect resources in the Gridworld over several rounds. You can learn which resource is the most valuable by watching how ${S.name} collects them. Remember, ${S.name} always collects the most valuable resource available, in as few steps as possible.</p>` +
        `<p>${S.name} can only see what isn\u2019t blocked by the brick walls. Areas ${S.name} hasn\u2019t seen yet are covered in grey fog, and the fog clears as ${S.name} explores, so you see the Gridworld as ${S.name} discovers it.</p>` +
        `<p><strong>After watching ${S.name}, you\u2019ll collect resources yourself.</strong></p>`),
      choices: ['Continue'],
      data: { task: 'learning_explanation' }
    };
    const alexQs = () => [
      { name: 'knows', prompt: `What does ${S.name} know?`, options: ['What each kind of resource is worth', 'Where all the resources are', 'Both of these', 'Neither of these'], correct: 'What each kind of resource is worth' },
      { name: 'does', prompt: `What does ${S.name} always do?`, options: ['Collects the most valuable resource available, in as few steps as possible', 'Collects the closest resource', 'Collects resources at random'], correct: 'Collects the most valuable resource available, in as few steps as possible' },
      { name: 'fog', prompt: 'What does the grey fog show?', options: [`Areas ${S.name} hasn\u2019t seen yet`, 'Walls no one can walk through', 'Areas with no resources'], correct: `Areas ${S.name} hasn\u2019t seen yet` }
    ];
    const alexCheck = {
      type: jsPsychSurveyMultiChoice,
      preamble: '<div class="gw-screen gw-text"><h2>Quick check</h2><p>Please answer these questions.</p></div>',
      questions: () => alexQs().map(q => ({ name: q.name, prompt: q.prompt, options: jsPsych.randomization.shuffle(q.options.slice()), required: true })),
      data: { task: 'demonstrator_check' },
      on_finish: data => {
        const qs = alexQs();
        data.n_correct = qs.filter(q => data.response[q.name] === q.correct).length;
        data.passed = data.n_correct === qs.length;
      }
    };
    timeline.push({
      timeline: [learnScreen, alexCheck, retryScreen('demonstrator_check', 'Read the explanation again')],
      loop_function: () => !lastOf('demonstrator_check').passed
    });

    // ---------- Reminder about Alex, just before the rounds ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen(`Now you will watch ${S.name} navigate the Gridworld`, alexProfile(true)),
      choices: ['Start watching'],
      data: { task: 'demonstrator_reminder' }
    });

    // ---------- Demonstrations ----------
    const demos = STIMULI.demos;
    jsPsych.data.addProperties({ demo_order: demos.map(d => d.id).join('|') });
    demos.forEach((stim, i) => {
      timeline.push({
        type: jsPsychGridDemo,
        stimulus: stim,
        counterbalance: () => S.cb,
        avatar: () => S.alexAvatar,
        speed: S.speed,
        timing: CONFIG.timing,
        header_html: () => header(`Watch ${S.name} to learn which resource is the most valuable in the Gridworld`, '', true),
        data: { task: 'demo', demo_index: i + 1 }
      });
    });

    // ---------- Test ----------
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: () => textScreen('Your turn',
        `<p>Now you\u2019ll collect resources yourself. Each kind of resource is worth the same as when ${S.name} was collecting.</p>` +
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
        button_label: i < tests.length - 1 ? 'Next round' : 'Finish',
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
    timeline.push({
      type: jsPsychSurveyText,
      preamble: '<div class="gw-screen gw-text"><h2>Your strategy</h2></div>',
      questions: [{ name: 'rule', prompt: 'In your own words, how did you determine which resource was the most valuable?', rows: 4, required: true }],
      data: { task: 'rule_report' }
    });
    (STIMULI.probes || []).forEach(p => {
      timeline.push({
        type: jsPsychGridProbe,
        probe_id: p.id,
        stimulus: demos.find(d => d.id === p.demo),
        agent_cell: p.agentCell, heading: p.heading,
        counterbalance: () => S.cb,
        avatar: () => S.alexAvatar,
        header_html: () => header(`Thinking about ${S.name}`, 'A moment from one of the rounds'),
        prompt: () => fill(p.prompt, Object.fromEntries(G.ROLES.map(r => [r, itemInline(r)]))),
        correct: 'A',
        data: { task: 'probe' }
      });
    });
    const scale = (lo, hi) => ['1<br>' + lo, '2', '3', '4', '5', '6', '7<br>' + hi];
    timeline.push({
      type: jsPsychSurveyLikert,
      preamble: () => `<div class="gw-screen gw-text"><h2>About ${S.name}</h2></div>`,
      questions: () => [
        { name: 'ease', prompt: `How easy was it to understand the reasons behind ${S.name}\u2019s actions?`, labels: scale('Very hard', 'Very easy'), required: true },
        { name: 'competence', prompt: `Evaluate ${S.name}\u2019s expertise in collecting valuable resources.`, labels: scale('Very low', 'Very high'), required: true },
        { name: 'similarity', prompt: `How similar to you does ${S.name} seem?`, labels: scale('Not at all similar', 'Extremely similar'), required: true }
      ],
      data: { task: 'ratings' }
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
    const filename = `${pid}_${Date.now()}.csv`;
    if (CONFIG.saveMethod === 'datapipe') {
      timeline.push({
        type: jsPsychPipe, action: 'save', experiment_id: CONFIG.datapipeExperimentId,
        filename, data_string: () => jsPsych.data.get().csv(),
        wait_message: '<p>Saving your answers. Please don\u2019t close this page.</p>'
      });
    } else if (CONFIG.saveMethod === 'jatos') {
      timeline.push({
        type: jsPsychCallFunction, async: true,
        func: done => { window.jatos.submitResultData(jsPsych.data.get().csv()).then(() => done()).catch(() => done()); }
      });
    } else if (CONFIG.saveMethod === 'local') {
      timeline.push({ type: jsPsychCallFunction, func: () => jsPsych.data.get().localSave('csv', filename) });
    } // 'none': nothing is saved (preview copies for collaborators)

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
