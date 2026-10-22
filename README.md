# Learning from a demonstrator: online experiment

A browser-based experiment built with jsPsych 8. Participants watch an expert demonstrator ("Alex")
collect resources in a Gridworld, then collect resources themselves. The test separates copying
Alex's observed choice (the second-best resource, which Alex collects in four of six rounds) from
inferring that a better resource exists (the best resource, which Alex never collects but was
looking for).

## Files

| File | What it contains | Edit it when you want to... |
|---|---|---|
| `index.html` | Loads jsPsych and the study files | switch to JATOS hosting |
| `preview.html` | Links to every condition and version, for collaborators | share it with a preview copy |
| `js/config.js` | Data saving, Prolific link, conditions, point values, timing, "about you" questions | set up and launch the study |
| `js/stimuli.js` | Demonstration layouts and paths, test trials, belief probe | change or add layouts |
| `js/experiment.js` | The full timeline: consent, questions, instructions, demos, test, measures, saving, final screen | change wording or the order of screens |
| `js/gridworld.js` | Item artwork, animation, and the four custom jsPsych plugins | change how things look or move |
| `js/gridworld-core.js` | Line-of-sight, paths, counterbalancing (no display code) | rarely |
| `css/experiment.css` | Visual styling | change the look |
| `img/alex-silhouette.png`, `img/alex-silhouette-small.png` | Picture of Alex on the "Meet Alex" and reminder screens, and a bolder small version for the card above each round | replace the picture (keep the file name, or change `humanPortrait` in `config.js`) |
| `tools/validate_stimuli.js` | Checks every demonstration | run after any change to `stimuli.js` |

## Try it on your computer

Open `index.html` in Chrome or Firefox (an internet connection is needed to load jsPsych). With the
default `saveMethod: 'local'`, a CSV file downloads at the end.

Useful address-bar options for testing (add after `index.html`):

- `?agent=similar` (or `dissimilar`, `control`) chooses the demonstrator condition
- `&cb=0` (to `3`) chooses which resource has which value
- `&speed=4` plays animations four times faster

Example: `index.html?agent=dissimilar&cb=2&speed=4`

## Design summary

- **Screen order.** Consent; five "about you" questions; the Gridworld explanation and a task check;
  "Matching you with an expert on the Gridworld..." (spinner for 3.5-6 s, then "Match found");
  "Meet Alex (name changed for anonymity)"; "Learning from Alex" and a check about Alex; a reminder
  screen ("Now you will watch Alex navigate the Gridworld", repeating the Alex profile under "About
  Alex"); six rounds of watching Alex; four test rounds; post-test measures; total points; a final "Thank you!" screen.
- **Resources.** Four kinds: grain, ore, wood, water. Their value roles (best, second, third,
  worst) rotate across participants in a Latin square (`cb` 0 to 3), so each resource plays each role
  equally often.
- **Conditions.** 3 demonstrator conditions (similar, dissimilar, control; Alex is presented as a
  human in all three) x 4 counterbalancing versions = 12 cells. Without URL options, each participant gets one at random
  (or balanced through DataPipe; see below).
- **Similarity manipulation.** Participants answer five questions about themselves: favorite
  music, movie, vacation and food (each with an importance rating), and which of three avatars they
  like best (blue, burgundy, green; shown without labels, in random order). A matching screen then
  suggests they are being paired with a real expert. The "Meet Alex (name changed for anonymity)"
  screen shows a line drawing of a person seen from behind (`img/alex-silhouette.png`), centered,
  then "Alex has done this task many times and over the last 20 trials has collected the maximum
  number of points every time." In the similar and dissimilar conditions it adds, in bold, that Alex
  answered the same questions and Alex's answers were very similar to (or very different from)
  theirs, with two examples: the topic the participant rated most extremely (furthest from the
  midpoint; ties, including all four rated the same, at random): "Alex feels the same about
  movies" (similar) or "Alex feels very differently about movies" (dissimilar); and Alex's favorite
  avatar, which is "also" the participant's choice (similar) or one of the other two (dissimilar).
  Alex appears with that avatar on the grid in every round; the card above each round shows the
  small line drawing with "Alex, Expert collector". In the
  control condition Alex has a neutral (peach) avatar that is not one of the three choices.
- **Expert framing.** In every condition, Alex is described as an expert who knows what each resource is worth, always collects the most valuable resource
  available, and does so in as few steps as possible because every step costs points.
- **Checks.** After the Gridworld explanation: how many kinds of resources there are, their names
  (typed; close variants such as "wheat", "rock", "ores" or "logs" are accepted), how many can be collected per
  round, and what costs points. After the Alex screens: what Alex knows, what Alex always does, and
  what the grey fog shows. Any wrong answer sends participants back to reread that explanation.
- **What participants see.** Walls are drawn as brick and are always visible. During the rounds
  with Alex, every area Alex has not yet seen is covered in grey fog, for the participant too; the
  fog clears for good as Alex explores, so participants see the Gridworld as Alex discovers it.
  Alex sees in all directions; only walls block the view. Test rounds are open, with no fog.
- **Rounds with Alex.** Six, in a fixed order. Alex collects the second-best resource in four
  rounds, the third-best in one, and the worst in one (open area, nothing else available). The
  best resource never appears in any round; participants first see it in the far test rounds. Together the rounds show second > third, second > worst, third > worst,
  and (from Alex's searching) that something better than the second-best exists. Nothing is shown
  after a round; the Continue button appears when Alex has collected the resource.
  The gaze of the demonstrator follows one rule in every round (look at visible resources at the
  start, nearest first; look toward the area to explore; stop to look at any resource that comes
  into view). Timing is set in `config.js` (`timing` for Alex, `testTiming` for the participant).
- **Test.** Four rounds, three resources each: two near rounds (second-best, third and worst) and
  two far rounds (best and second-best at equal distance, plus one other). No feedback until the end.
- **Measures after the test.** Value ranking of the four resources (shown in a random order that is
  never the correct one); "In your own words, how did you determine which resource was the most
  valuable?"; belief probe with confidence; ratings of how easy Alex's actions were to understand,
  Alex's expertise, and similarity (manipulation check). The total points from the test rounds are
  shown last, after all the questions.

| Round (`demo_id`) | What Alex does |
|---|---|
| `open_only_worst` | Open area, only the worst resource: looks around, goes straight to it |
| `corner_check_returns` | Second-best in view in the lower right; walks up to look behind the wall, sees the third-best in the upper right, turns back and collects the second-best |
| `pillar_room_empty` | Second-best in view; walks round, sees the third-best, checks the walled room (empty), returns to the second-best. A pillar seals off part of the room, which stays fogged |
| `two_alcoves` | Second-best close by; checks both hidden corners (worst in one, nothing in the other), returns to the second-best |
| `third_over_worst` | Worst close by; checks behind the wall, finds the third-best, and collects it although it is farther away |
| `room_empty` | Second-best close by; walks round, sees the worst, checks the empty room, returns to the second-best |

## Before launching

1. **Ethics.** The consent form is in place. There is no debrief screen: the study ends with "Thank
   you!". The study presents Alex as a real, matched person with a record of past performance, and
   tells similar/dissimilar participants how Alex's answers compare with theirs; none of this is
   real. Check that your IRB approval covers this deception and how participants will be debriefed
   (for example, a debriefing message sent through Prolific after data collection).
2. **Pilot the values.** `values` and `stepCost` in `js/config.js` decide whether Alex's detours look
   sensible. Check the pilot data to make sure control participants are not already choosing the
   best item on nearly every far-transfer trial.
3. **Pilot the appearance of the resources.** Ask a small sample how valuable each resource looks
   with no other information, to check none stands out.
4. **Choose data saving and hosting** (next section).
5. **Run the stimulus check** if you changed any layout: `node tools/validate_stimuli.js`
   (requires Node.js). It reports where each hidden item first comes into view, checks that every
   attempt at a gap is into a cell Alex cannot walk through, flags any
   stretch of walking that is longer than the shortest route, flags any
   demonstration where Alex turns back before or after a hidden area becomes fully visible, and
   checks that the item Alex collects is the best choice given the point values and the steps
   still to walk. Run it again whenever you change `values` or `stepCost`.

## Hosting and saving data

**Recommended: DataPipe + GitHub Pages (free).**
1. Create an OSF project and a DataPipe experiment at <https://pipe.jspsych.org>; copy the
   experiment ID into `datapipeExperimentId` and set `saveMethod: 'datapipe'`.
2. For balanced assignment, enable condition assignment on DataPipe with **12** conditions and set
   `useDataPipeConditions: true`.
3. Upload this folder to a GitHub repository and turn on GitHub Pages. The study URL is the Pages
   address of `index.html`.
4. Data arrive in your OSF project as one CSV per participant.

**JATOS** (if your institution runs a JATOS server): set `saveMethod: 'jatos'`, uncomment the
`jatos.js` line in `index.html`, zip the folder, and import it as a study in JATOS.

**Cognition.run** and similar jsPsych hosts also work; upload the files and follow the host's
instructions for saving data.

## Sharing with collaborators

The easiest way to get feedback is a **preview copy on GitHub Pages**: collaborators open a link in
their browser and click through, with nothing to install.

1. In `js/config.js`, set `saveMethod: 'none'` so nothing is saved or downloaded.
2. Create a GitHub repository, upload the whole folder (including `img/`), and turn on GitHub Pages
   (Settings > Pages > deploy from the main branch).
3. Send collaborators the address of `preview.html`. It links to every condition and value version,
   with an option to play Alex's rounds faster.

If you also want comments on the code, add collaborators to the repository. Note that a public
repository makes the design (including that Alex is not a real person) visible to
anyone, including potential participants. A private repository avoids that, but GitHub Pages on a
private repository needs a paid plan (free for students through GitHub Education). For the real
study, use a separate copy with `saveMethod` set to `'datapipe'` or `'jatos'`.

## Prolific

Use this study URL in Prolific, with Prolific's URL parameters switched on:
`https://YOUR-STUDY-URL/index.html?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`

Put Prolific's completion URL into `prolificCompletionUrl`; participants are sent there after the
final screen. Do not include the testing options (`agent`, `cb`, `speed`) in the live link.

## Data

One row per screen. Every row carries `participant_id`, `agent_condition`, `participant_avatar`, `alex_avatar`,
`counterbalance`, `item_best`, `item_second`, `item_third`, `item_worst`. Filter rows with the `task` column:

| `task` | Key columns |
|---|---|
| `consent` | `consented` (participants who decline end the study there; no data are saved for them) |
| `preferences` | `response` (answers, importance ratings, `avatar_choice`), `participant_avatar`, `alex_avatar`, `match_item` (topic named on the Meet Alex screen), `match_participant_rating`, `avatar_order` |
| `task_check` | `resource_count`, `resource_names` (typed), `resource_names_matched`, `response`, `passed` (one row per attempt) |
| `demonstrator_check` | `response`, `n_correct`, `passed` (one row per attempt) |
| `demo` | `demo_id`, `demo_index`, `watch_ms` (time from start of the round to Continue appearing), `prompt_view_ms` (time from Continue appearing to the click) |
| `test` | `test_id`, `test_kind` (near/far), `choice_rank` (best/second/third/worst), `choice_item`, `chose_best_available`, `points`, `rt` |
| `ranking` | `display_order` (order the resources were shown in), `ranking_items`, `rank_of_best`, `rank_of_second`, `rank_of_third`, `rank_of_worst`, `best_above_second`, `ranking_correct` |
| `rule_report` | `response` (how they determined which resource was most valuable) |
| `probe` | `probe_choice_item`, `probe_correct`, `confidence`, `probe_rt` |
| `ratings` | `response` (`ease`, `competence` = expertise, `similarity`; each 0-6 = scale points 1-7) |

The main dependent variable is the proportion of far-transfer trials where `choice_rank` is `best`.
