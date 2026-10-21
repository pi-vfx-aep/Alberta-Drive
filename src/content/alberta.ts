/**
 * Educational content for Alberta driving.
 *
 * ⚠️ ACCURACY: content here is paraphrased from the official Alberta Driver's
 * Guide and Government of Alberta road-safety information. Every entry carries
 * a `source` note. Before publishing or exam use, re-verify against the
 * current official guide — rules, limits and zone hours change over time.
 * Never present this as an official Government of Alberta test.
 */

export const DISCLAIMER =
  'This is an independent learning aid. It is not an official Government of ' +
  'Alberta test, not an official road test, and does not replace the Alberta ' +
  "Driver's Guide, professional driving instruction, or the legal requirements " +
  'for obtaining a licence. Verify all rules against the current official guide.'

export interface SignDef {
  id: string
  name: string
  shape:
    'octagon' | 'circle' | 'triangle' | 'rectangle' | 'diamond' | 'pentagon' | 'cross'
  meaning: string
  category: 'regulatory' | 'warning' | 'information' | 'priority'
  source: string
}

const GUIDE = "Alberta Driver's Guide"

/** Canadian (Alberta) signs used for the in-game sign learning feature. */
export const SIGNS: SignDef[] = [
  {
    id: 'stop',
    name: 'Stop',
    shape: 'octagon',
    category: 'priority',
    meaning:
      'Come to a complete stop at the stop line (or before entering the intersection), yield to traffic and pedestrians already there, then proceed when it is safe.',
    source: GUIDE,
  },
  {
    id: 'yield',
    name: 'Yield',
    shape: 'triangle',
    category: 'priority',
    meaning:
      'Slow down and give the right-of-way to traffic and pedestrians in or entering your path. Stop only if necessary.',
    source: GUIDE,
  },
  {
    id: 'speed50',
    name: 'Speed limit 50',
    shape: 'rectangle',
    category: 'regulatory',
    meaning:
      'Maximum posted speed in km/h. The default urban limit in Alberta where no sign is posted is 50 km/h.',
    source: GUIDE,
  },
  {
    id: 'speed30',
    name: 'Speed limit 30 (school / playground zone)',
    shape: 'rectangle',
    category: 'regulatory',
    meaning:
      'When children are present in a school or playground zone the limit is 30 km/h. Watch for the posted hours and flashing beacons.',
    source: GUIDE,
  },
  {
    id: 'speed100',
    name: 'Speed limit 100',
    shape: 'rectangle',
    category: 'regulatory',
    meaning:
      'Maximum posted speed in km/h on this rural highway. The default rural highway limit in Alberta is 100 km/h where no sign is posted.',
    source: GUIDE,
  },
  {
    id: 'pedestrian',
    name: 'Pedestrian crossing',
    shape: 'diamond',
    category: 'warning',
    meaning:
      'A pedestrian crossing is ahead. Be prepared to stop and yield to pedestrians in the crosswalk.',
    source: GUIDE,
  },
  {
    id: 'school',
    name: 'School zone ahead',
    shape: 'pentagon',
    category: 'warning',
    meaning:
      'Children may be crossing. Slow down and watch for a reduced limit and flashing lights.',
    source: GUIDE,
  },
  {
    id: 'railway',
    name: 'Railway crossing',
    shape: 'cross',
    category: 'warning',
    meaning:
      'A railway crossing is ahead. Never stop on the tracks; if lights flash or a gate lowers, stop and wait until it is safe.',
    source: GUIDE,
  },
  {
    id: 'construction',
    name: 'Construction / roadwork ahead',
    shape: 'diamond',
    category: 'warning',
    meaning:
      'Workers and equipment may be on or beside the road. Obey flaggers, temporary signs and reduced limits.',
    source: GUIDE,
  },
  {
    id: 'doNotEnter',
    name: 'Do not enter',
    shape: 'rectangle',
    category: 'regulatory',
    meaning:
      'Do not enter this roadway - it is a one-way street or a controlled access ramp.',
    source: GUIDE,
  },
  {
    id: 'noPassing',
    name: 'No passing',
    shape: 'rectangle',
    category: 'regulatory',
    meaning:
      'Passing is prohibited. On two-lane roads a solid yellow line on your side means you may not pass.',
    source: GUIDE,
  },
  {
    id: 'roundabout',
    name: 'Roundabout ahead',
    shape: 'triangle',
    category: 'warning',
    meaning:
      'Enter the roundabout slowly and yield to traffic already circulating. Signal your exit.',
    source: GUIDE,
  },
]

export interface KnowledgeQuestion {
  q: string
  options: string[]
  answer: number
  explain: string
  source: string
}

/**
 * A deliberately small set of well-established questions. Any detail that
 * depends on posted signs, hours or current legislation is phrased so the
 * player is told to check the sign or the official guide.
 */
export const QUESTIONS: KnowledgeQuestion[] = [
  {
    q: 'What is the default speed limit on an urban street in Alberta when no signs are posted?',
    options: ['40 km/h', '50 km/h', '60 km/h', '70 km/h'],
    answer: 1,
    explain:
      "Alberta's default urban limit is 50 km/h. Posted signs override the default, so always read them.",
    source: GUIDE,
  },
  {
    q: 'What is the default speed limit on a rural highway in Alberta when no signs are posted?',
    options: ['80 km/h', '90 km/h', '100 km/h', '110 km/h'],
    answer: 2,
    explain:
      'The default rural highway limit is 100 km/h. Divided highways and specific stretches may post a higher or lower limit.',
    source: GUIDE,
  },
  {
    q: 'In a school or playground zone, what is the limit when children are present?',
    options: ['20 km/h', '30 km/h', '40 km/h', 'It never changes'],
    answer: 1,
    explain:
      'The limit drops to 30 km/h when children are present. Check the posted signs for the hours that apply and watch for flashing beacons.',
    source: GUIDE,
  },
  {
    q: 'You arrive first at an all-way (four-way) stop. What do you do?',
    options: [
      'Proceed immediately - you were first',
      'Come to a full stop, then proceed when it is safe',
      'Sound your horn, then proceed',
      'Proceed only if a car behind you is waiting',
    ],
    answer: 1,
    explain:
      'You must stop completely. The first vehicle to stop is the first to proceed; if two arrive at the same time, the driver on the left yields to the driver on the right.',
    source: GUIDE,
  },
  {
    q: 'Entering a roundabout, another vehicle is already circulating. Who has the right-of-way?',
    options: [
      'You do - you arrived first',
      'The circulating vehicle',
      'The larger vehicle',
      'Whoever honks first',
    ],
    answer: 1,
    explain:
      'Yield to traffic already in the roundabout. Enter only when there is a gap you can safely take.',
    source: GUIDE,
  },
  {
    q: 'A learner (Class 7) driver in Alberta has which blood alcohol limit?',
    options: ['0.05', '0.08', 'Zero tolerance - 0.00', 'It depends on the vehicle'],
    answer: 2,
    explain:
      'Learner drivers have zero tolerance for alcohol. Any measurable amount can cost you your licence.',
    source: GUIDE,
  },
  {
    q: 'On a two-lane road, what does a solid yellow line on your side of the centre line mean?',
    options: [
      'Passing is allowed',
      'Passing is not allowed',
      'You must drive in the left lane',
      'The road ends ahead',
    ],
    answer: 1,
    explain:
      'A solid yellow line on your side means no passing. A broken yellow line permits passing only when it is safe and legal to do so.',
    source: GUIDE,
  },
  {
    q: 'What is a safe following gap in good conditions?',
    options: [
      'Half a second',
      'At least 2 seconds',
      'Keep 1 second for every 10 km/h',
      'As close as you can see their mirrors',
    ],
    answer: 1,
    explain:
      'Use at least a 2-second gap in good conditions and increase it in rain, snow, ice, fog or at night.',
    source: GUIDE,
  },
  {
    q: 'Flashing lights and bells at a railway crossing mean:',
    options: [
      'Slow down and continue if the way looks clear',
      'Stop and wait until the signals stop - never stop on the tracks',
      'Honk, then cross quickly',
      'Cross only if you are in the right lane',
    ],
    answer: 1,
    explain:
      'Flashing red lights, bells or a lowering gate mean a train is coming. Stop well back and never stop on or too close to the tracks.',
    source: GUIDE,
  },
  {
    q: 'You are entering a highway from an entrance ramp. What must you do?',
    options: [
      'Traffic already on the highway must yield to you',
      'Yield to traffic already on the highway and match their speed',
      'Stop at the end of the ramp and wait',
      'Drive onto the shoulder and merge from there',
    ],
    answer: 1,
    explain:
      'Traffic on the highway has the right-of-way. Use the ramp to build up speed and merge into a gap.',
    source: GUIDE,
  },
  {
    q: 'An emergency vehicle approaches from behind with flashing lights and a siren. What do you do?',
    options: [
      'Speed up to get out of the way',
      'Pull as far to the right as safe and stop',
      'Stop in the lane you are in',
      'Turn left at the next intersection',
    ],
    answer: 1,
    explain:
      'Pull as far right as you safely can and come to a stop, then proceed when the vehicle has passed and it is safe.',
    source: GUIDE,
  },
  {
    q: 'A pedestrian is in a marked crosswalk you want to enter. What do you do?',
    options: [
      'Proceed slowly around them',
      'Yield - stop and let them finish crossing',
      'Honk to warn them',
      'You only yield at unmarked crossings',
    ],
    answer: 1,
    explain:
      'Drivers must yield to pedestrians in a crosswalk. Wait until they have fully cleared your path.',
    source: GUIDE,
  },
  {
    q: 'The traffic light turns amber (yellow) as you approach at a safe stopping speed. What should you do?',
    options: [
      'Accelerate to clear the intersection',
      'Stop, if you can do so safely',
      'Swerve around the corner',
      'Continue at the same speed',
    ],
    answer: 1,
    explain:
      'An amber light warns the light is about to turn red. Stop if you can stop safely; only proceed if stopping would be more dangerous.',
    source: GUIDE,
  },
  {
    q: 'Using a handheld phone while driving in Alberta:',
    options: [
      'Is allowed at red lights only',
      'Is allowed if you use one touch',
      'Is prohibited - handheld use while driving is not allowed',
      'Is allowed on highways only',
    ],
    answer: 2,
    explain:
      "Handheld phone use while driving is prohibited in Alberta. Check the current Alberta Driver's Guide for the detailed rules that apply to hands-free devices and to learner/GDL drivers.",
    source: GUIDE,
  },
]

export interface LessonObjective {
  id: string
  text: string
  need: number
}

export interface LessonDef {
  id: string
  title: string
  kind: 'lesson' | 'mocktest'
  blurb: string
  demo: string
  briefing: string[]
  objectives: LessonObjective[]
  timeLimit?: number
}

export const LESSONS: LessonDef[] = [
  {
    id: 'startup',
    title: 'Starting and moving off',
    kind: 'lesson',
    blurb:
      'Every drive starts the same way: adjust, buckle up, start the engine, release the parking brake, signal, check, then move away from the curb smoothly.',
    demo: 'Watch the dashboard: the seatbelt and parking-brake lights should both be out before you move. Signal right, check your mirror and blind spot with the mouse, then ease onto the road.',
    briefing: [
      'Welcome. Today we will cover starting the vehicle and moving away from the curb.',
      'Press E to start the engine, B to fasten your seatbelt, and Space to release the parking brake.',
      'When you are ready, signal right, check your blind spot, and pull away from the curb.',
    ],
    objectives: [
      { id: 'engineStart', text: 'Start the engine', need: 1 },
      { id: 'seatbelt', text: 'Fasten the seatbelt', need: 1 },
      { id: 'parkingRelease', text: 'Release the parking brake', need: 1 },
      { id: 'moveOff', text: 'Move away from the curb safely', need: 1 },
    ],
  },
  {
    id: 'stopsign',
    title: 'Stop signs and four-way stops',
    kind: 'lesson',
    blurb:
      'A stop means a complete stop - wheels not rolling - behind the stop line, then a scan: left, right, left, and crosswalk before proceeding.',
    demo: 'At a four-way stop, whoever stops first goes first. If you arrive at the same time, the driver on the left yields to the driver on the right. Take your time and look.',
    briefing: [
      'Approach each stop sign and come to a complete stop behind the line.',
      'Scan the intersection for traffic and pedestrians before proceeding.',
      'You will need three complete stops to finish this lesson.',
    ],
    objectives: [
      { id: 'properStop', text: 'Come to a complete stop at stop signs', need: 3 },
      { id: 'failedStop', text: 'Rolling stops', need: 0 },
    ],
  },
  {
    id: 'lanes',
    title: 'Lane changes and shoulder checks',
    kind: 'lesson',
    blurb:
      'A lane change has four parts: mirror, signal, shoulder check, then move. Never change lanes without physically looking over your shoulder.',
    demo: 'Notice how the instructor only prompts you - you choose when it is safe. Signal at least three seconds before moving, and turn your head to check the blind spot first.',
    briefing: [
      'We will change lanes twice on this road.',
      'Signal, check your mirror, and turn your head to check the blind spot before each change.',
      'Move smoothly - do not swerve.',
    ],
    objectives: [
      {
        id: 'laneChange',
        text: 'Safe lane changes (signalled + shoulder checked)',
        need: 2,
      },
    ],
  },
  {
    id: 'parking',
    title: 'Parallel parking',
    kind: 'lesson',
    blurb:
      'Pull up beside the car in front of the space, reverse while steering in, straighten up, and finish roughly half a metre from the curb - without touching it or the other vehicle.',
    demo: 'Use your mirrors and look behind you. Speed is not the goal - control is. The space is marked on the right-hand side of the road.',
    briefing: [
      'Find the marked parallel parking space on the right.',
      'Pull up alongside the vehicle in front of the space, then reverse in.',
      'Finish within the space, close to the curb, without hitting anything.',
    ],
    objectives: [{ id: 'parallelPark', text: 'Complete a parallel park', need: 1 }],
  },
  {
    id: 'mock5',
    title: 'Mock Class 5 road test',
    kind: 'mocktest',
    blurb:
      'A simulated drive test with an examiner. You will receive instructions only - how you carry them out is up to you. Mistakes are scored by severity.',
    demo: 'The examiner will not tell you how to do anything. Listen, plan ahead, and demonstrate the skill yourself.',
    briefing: [
      'This is a practice simulation, not an official Alberta road test or Government of Alberta scoring system.',
      'The examiner will give instructions. Carry them out safely and independently.',
      'Your drive ends when the examiner asks you to pull over and park.',
    ],
    objectives: [],
    timeLimit: 480,
  },
]

export const ACHIEVEMENTS: { id: string; name: string; desc: string }[] = [
  { id: 'firstLesson', name: 'First Lesson Complete', desc: 'Finish any lesson' },
  {
    id: 'perfectPark',
    name: 'Perfect Parallel Park',
    desc: 'Parallel park without a fault',
  },
  {
    id: 'mirrorMaster',
    name: 'Mirror Check Master',
    desc: 'Complete 10 shoulder-checked lane changes',
  },
  {
    id: 'hazardSpotter',
    name: 'Hazard Spotter',
    desc: 'Yield correctly to 5 pedestrians',
  },
  { id: 'stopPro', name: 'Stop Sign Pro', desc: 'Pass the stop-sign lesson with 90+' },
  { id: 'mockPassed', name: 'Mock Test Passed', desc: 'Pass the mock road test' },
  {
    id: 'knowledgePassed',
    name: 'Knowledge Ready',
    desc: 'Score 80%+ on the practice knowledge test',
  },
  {
    id: 'safeDriver',
    name: 'Safe Driving Streak',
    desc: 'Finish a lesson with no serious or dangerous mistakes',
  },
]
