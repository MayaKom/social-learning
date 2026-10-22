/*
 * Study configuration. Most changes you will need to make before launching are in this file.
 */
const CONFIG = {
  studyVersion: '0.1.0',

  // ---- Data saving ----
  // 'local'    : downloads a CSV file at the end (for testing on your own computer only)
  // 'datapipe' : saves to OSF through DataPipe (https://pipe.jspsych.org); works on any static host
  // 'jatos'    : saves to a JATOS server (also uncomment the jatos.js line in index.html)
  // 'none'     : saves nothing (for a preview copy shared with collaborators)
  saveMethod: 'local',
  datapipeExperimentId: 'REPLACE_WITH_DATAPIPE_ID',
  // Balanced condition assignment through DataPipe. Set the number of conditions to 12 on the
  // DataPipe site (3 demonstrator conditions x 4 counterbalancing versions).
  useDataPipeConditions: false,

  // ---- Prolific ----
  // Leave completionUrl empty to skip the redirect at the end.
  prolificCompletionUrl: '',

  // ---- Conditions ----
  agentConditions: ['similar', 'dissimilar', 'control'],
  demonstratorName: 'Alex',

  // Show a short reminder of the demonstrator description above each demonstration.
  showReminder: true,

  // ---- Task parameters ----
  values: { A: 60, B: 40, C: 25, D: 10 }, // A = best, B = second, C = third, D = worst (points)
  stepCost: 1,
  // Animation timing in milliseconds: demonstrations (timing) and the participant's own moves (testTiming).
  timing: { start: 1000, look: 1300, turn: 420, step: 420, collect: 600 },
  testTiming: { start: 0, look: 0, turn: 220, step: 240, collect: 400 },

  // ---- "About you" questions, asked before the task ----
  // Used for the similarity manipulation. On the "Meet Alex" screen, the topic the participant
  // rated most extremely (furthest from the midpoint; ties at random) is named: "Alex feels the
  // same about ..." (similar) or "Alex feels very differently about ..." (dissimilar). Alex's
  // favorite avatar is the participant's choice (similar) or one of the other two (dissimilar),
  // and Alex appears with that avatar in every round. `topic` is the word used in the sentence.
  preferenceItems: [
    { id: 'music', question: 'What kind of music do you like most?', importance: 'How important is music to you?',
      topic: 'music', verb: 'is',
      options: ['Pop', 'Rock', 'Hip-hop', 'Classical', 'Jazz', 'Electronic', 'Country', 'Folk'] },
    { id: 'movie', question: 'What kind of movie do you enjoy most?', importance: 'How important are movies to you?',
      topic: 'movies', verb: 'are',
      options: ['Comedy', 'Drama', 'Action', 'Horror', 'Science fiction', 'Documentary', 'Romance', 'Animation'] },
    { id: 'vacation', question: 'What kind of vacation do you enjoy most?', importance: 'How important are vacations to you?',
      topic: 'vacations', verb: 'are',
      options: ['Beach', 'City', 'Mountains', 'Countryside', 'Cruise', 'Camping'] },
    { id: 'food', question: 'What kind of food do you enjoy most?', importance: 'How important is food to you?',
      topic: 'food', verb: 'is',
      options: ['Italian', 'Chinese', 'Indian', 'Mexican', 'Japanese', 'Middle Eastern', 'Thai', 'French'] }
  ],
  avatarQuestion: 'Which of the following avatars do you like best?',
  avatarOptions: ['blue', 'burgundy', 'green'],
  // Used on the "Meet Alex" screen: "Alex answered the same questions about ..."
  topicsText: 'music, vacations, movies, food and avatars',
  // Picture of Alex on the "Meet Alex" and reminder screens.
  humanPortrait: 'img/alex-silhouette.png',
  // Smaller version with bolder lines, for the card above each of Alex's rounds.
  humanPortraitSmall: 'img/alex-silhouette-small.png',
  // The "matching you with an expert" screen shows a spinner for a random time in this range
  // (milliseconds), then "Match found" for matchFoundMs.
  matchingMs: [3500, 6000],
  matchFoundMs: 1200,
  // Avatar for the demonstrator in the control condition (not one of the three choices).
  neutralAvatar: 'neutral'
};

if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG };
