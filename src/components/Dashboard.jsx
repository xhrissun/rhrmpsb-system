import React, { useState, useEffect, useRef } from 'react';
import RaterView from './RaterView';
import SecretariatView from './SecretariatView';
import AdminView from './AdminView';
import { USER_TYPES } from '../utils/constants';
import { usersAPI } from '../utils/api';

// ─── CBS-Aligned Rating Scale (numeric → adjectival) ─────────────────────────
const CBS_RATING_SCALE = [
  {
    score: 5,
    label: 'Outstanding',
    shortLabel: 'O',
    color: '#065f46',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    tagBg: '#d1fae5',
    description:
      'Performance consistently and significantly exceeds expected results. All STAR/BEI components are fully present, specific, and verifiable. Actions demonstrate mastery of the competency at a level that goes beyond what the position demands. Results are measurable and clearly attributed to the candidate. Candidate shows strong self-awareness and transferable learning.',
    beiAnchor:
      'Provided 2+ fully detailed behavioral events with all 5 BEI elements (Context, Task, Actions, Thoughts/Feelings, Results). Pattern of excellence is evident across events.',
  },
  {
    score: 4,
    label: 'Very Satisfactory',
    shortLabel: 'VS',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#93c5fd',
    tagBg: '#dbeafe',
    description:
      'Performance frequently exceeds expected results. Most STAR/BEI components are clear and complete with minimal prompting. Actions show solid competency demonstration. Results are present but may lack full quantification. Candidate can reflect on the experience with minimal prompting.',
    beiAnchor:
      'One complete behavioral event provided with minimal probing. Thoughts/feelings element present but may be brief. Actions clearly demonstrate the competency at the expected level.',
  },
  {
    score: 3,
    label: 'Satisfactory',
    shortLabel: 'S',
    color: '#92400e',
    bg: '#fffbeb',
    border: '#fcd34d',
    tagBg: '#fef3c7',
    description:
      'Performance meets expected results. STAR/BEI components are partially present. Some prompting was required. Actions show basic competency but limited depth. Results are mentioned but not well-quantified. Candidate demonstrates some awareness of impact.',
    beiAnchor:
      'One behavioral event provided but required moderate probing. Most STAR components present; thoughts/feelings element thin or absent. Actions demonstrate the competency at a basic or developing level.',
  },
  {
    score: 2,
    label: 'Unsatisfactory',
    shortLabel: 'US',
    color: '#b45309',
    bg: '#fff7ed',
    border: '#fdba74',
    tagBg: '#ffedd5',
    description:
      'Performance fails to meet expected results. STAR/BEI components are incomplete or unclear. Significant prompting was required. Actions are vague or lack personal ownership. Results are unclear or not connected to actions. Competency demonstration is weak.',
    beiAnchor:
      'Partial behavioral event only; significant probing required. Candidate frequently shifted to hypothetical or general responses. Actions vague, unclear, or heavy use of "we" with no personal ownership.',
  },
  {
    score: 1,
    label: 'Poor',
    shortLabel: 'P',
    color: '#991b1b',
    bg: '#fef2f2',
    border: '#fca5a5',
    tagBg: '#fee2e2',
    description:
      'Performance is significantly below expected results. Response lacks meaningful STAR/BEI components even with heavy prompting. Cannot provide specific examples. Actions and results are absent or implausible. No evidence of the competency being assessed.',
    beiAnchor:
      'No specific behavioral event provided despite repeated probing. Candidate responded only with opinions, generalities, or hypotheticals. No personal actions described — only team or organizational actions.',
  },
];

// ─── STAR Components ──────────────────────────────────────────────────────────
const STAR_SECTIONS = [
  {
    letter: 'S',
    word: 'Situation',
    color: '#1d4ed8',
    lightColor: '#eff6ff',
    borderColor: '#bfdbfe',
    icon: '🔍',
    tagline: 'Set the scene',
    description:
      'Describe the context and background of the specific situation or challenge the candidate faced. A valid situation must be real, past-tense, and specific — not hypothetical or generic.',
    interviewerTips: [
      'Ask about a specific past event, not a hypothetical ("Tell me about a time when…")',
      'Probe for details: When did this happen? What was the environment?',
      'Clarify the candidate\'s role and level of responsibility at the time',
      'Look for situations that are relevant to the CBS competency being assessed',
      'Situations can be drawn from current role, previous roles, or even training/volunteer work',
    ],
    probeQuestions: [
      '"When exactly did this happen, and what was your role at the time?"',
      '"What were the key constraints or challenges in that environment?"',
      '"What was the broader context — why did this matter to the organization?"',
      '"How did you come to be involved in this situation?"',
    ],
    redFlags: [
      'Vague or generic descriptions ("I always do this…" / "In general, I…")',
      'Hypothetical responses ("If that happened, I would…")',
      'Cannot recall specific details or timeframe',
      'Situation involves no meaningful challenge relevant to the competency',
    ],
  },
  {
    letter: 'T',
    word: 'Task',
    color: '#065f46',
    lightColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    icon: '🎯',
    tagline: 'Define the responsibility',
    description:
      'Clarify what the candidate was specifically responsible for — their goal, obligation, or challenge within the situation. The task must be personal, not just the team\'s objective.',
    interviewerTips: [
      'Distinguish between what the team did and what the candidate personally did',
      'Identify the specific objective they were trying to achieve',
      'Determine if the task was assigned or self-initiated (self-initiation scores higher)',
      'Assess the scope and complexity of the responsibility relative to the position level',
    ],
    probeQuestions: [
      '"What specifically were YOU responsible for in this situation?"',
      '"Was this task assigned to you, or did you take it on yourself?"',
      '"What was the expected outcome or deliverable from your end?"',
      '"What would have happened if you had not taken action?"',
    ],
    redFlags: [
      'Overuse of "we" without clarifying personal contribution',
      'Unclear ownership of the task',
      'Task seems too simple or unrelated to the CBS competency level being assessed',
      'Candidate conflates their task with the team\'s overall objective',
    ],
  },
  {
    letter: 'A',
    word: 'Action',
    color: '#92400e',
    lightColor: '#fffbeb',
    borderColor: '#fcd34d',
    icon: '⚡',
    tagline: 'Unpack what they did',
    description:
      'The heart of the CBS BEI — what specific steps did the candidate personally take to address the situation? Actions must be behavioral (observable, specific, past-tense) and personally attributable.',
    interviewerTips: [
      'This is the most important and most heavily weighted component — dig deep here',
      'Ask for a step-by-step breakdown of exactly what they did',
      'Distinguish their actions from those of teammates, supervisors, or systems',
      'Look for initiative, judgment calls, and CBS competency indicators in the actions',
      'Follow up on each action: "Why did you choose that approach over others?"',
    ],
    probeQuestions: [
      '"Walk me through exactly what YOU did, step by step."',
      '"Why did you choose that particular approach?"',
      '"What alternatives did you consider, and why did you decide against them?"',
      '"How did you handle any obstacles or resistance you encountered?"',
      '"What decisions did you personally make — and who else was involved?"',
      '"Did you involve others? What was your role versus theirs?"',
    ],
    redFlags: [
      'Actions are vague ("I managed the situation" / "I coordinated")',
      'Cannot explain their reasoning or decision-making process',
      'Actions seem inconsistent with the outcome described',
      'Difficulty separating their actions from the team\'s collective actions',
      'Actions were reactive only — no initiative or judgment demonstrated',
    ],
  },
  {
    letter: 'R',
    word: 'Result',
    color: '#581c87',
    lightColor: '#faf5ff',
    borderColor: '#d8b4fe',
    icon: '🏆',
    tagline: 'Measure the impact',
    description:
      'What was the outcome? Look for concrete, measurable results and evidence of reflection. Under CBS standards, results must be attributable to the candidate\'s specific actions — not just favorable circumstances.',
    interviewerTips: [
      'Push for quantifiable outcomes (percentages, numbers, timelines, cost savings)',
      'Ask about both immediate and long-term results, including effects on the unit/agency',
      'Explore what the candidate learned from the experience (CBS values continuous learning)',
      'Verify that the result was actually caused by their actions, not by others or luck',
      'Look for self-awareness — can they reflect on what went well or poorly?',
    ],
    probeQuestions: [
      '"What was the specific outcome of your actions?"',
      '"Can you give me numbers or percentages to describe the result?"',
      '"How did your supervisor, team, or stakeholders respond to the outcome?"',
      '"What did you personally learn from this experience?"',
      '"If you faced this situation again, what would you do differently?"',
      '"Was the overall outcome positive? If not, what did you do about it?"',
    ],
    redFlags: [
      'Results are vague or unmeasured ("it went well" / "everyone was happy")',
      'Cannot connect their specific actions to the outcome',
      'No reflection or learning — suggests limited self-awareness',
      'Results seem implausible, exaggerated, or attributable only to others',
      'Outcome was negative but candidate shows no accountability',
    ],
  },
];

// ─── DENR CBS Competency Sample Questions ─────────────────────────────────────
const CBS_SAMPLE_QUESTIONS = [
  {
    category: 'Core Values & Integrity (DENR)',
    color: '#312e81', bg: '#eef2ff', border: '#a5b4fc', icon: '⚖️',
    questions: [
      'Tell me about a time when you faced pressure to compromise your professional or ethical standards.',
      'Describe a situation where you had to report or address unethical behavior in the workplace.',
      'Give me an example of when you had to enforce a policy or rule that was unpopular.',
      'Tell me about a time when you had to balance competing obligations or interests while maintaining integrity.',
      'Describe a time when you acted in the interest of the public even when it was not the easiest path.',
    ],
  },
  {
    category: 'Excellence & Quality of Work',
    color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', icon: '⭐',
    questions: [
      'Tell me about a time when you identified a significant error or gap in a process and took steps to correct it.',
      'Describe a project where you set high standards for yourself and your team and delivered results above expectations.',
      'Give me an example of when you went beyond your assigned duties to improve output or service quality.',
      'Tell me about a time when you had to balance quality with tight deadlines — how did you manage it?',
    ],
  },
  {
    category: 'Leadership & Management',
    color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', icon: '👑',
    questions: [
      'Tell me about a time when you had to lead a team through a significant challenge or organizational change.',
      'Describe a situation where you had to motivate a team member who was underperforming.',
      'Give me an example of when you had to make a difficult decision under uncertainty or with limited information.',
      'Tell me about a time when you successfully built consensus among people with opposing views.',
      'Describe a time when you developed a subordinate\'s skills and saw tangible improvement.',
    ],
  },
  {
    category: 'Planning, Organization & Execution',
    color: '#92400e', bg: '#fffbeb', border: '#fcd34d', icon: '📋',
    questions: [
      'Tell me about a time when you had to manage multiple competing priorities under tight deadlines.',
      'Describe a project where you created and executed a detailed work plan that delivered results.',
      'Give me an example of when your planning helped you anticipate and prevent a problem before it occurred.',
      'Tell me about a time when unexpected developments disrupted your plan and how you adapted.',
    ],
  },
  {
    category: 'Communication & Stakeholder Management',
    color: '#0c4a6e', bg: '#f0f9ff', border: '#7dd3fc', icon: '🗣️',
    questions: [
      'Tell me about a time when you had to communicate complex or technical information to a non-technical audience.',
      'Describe a situation where you had to deliver unwelcome news or difficult feedback to someone.',
      'Give me an example of when you successfully managed a difficult stakeholder or external partner relationship.',
      'Tell me about a time when miscommunication caused a problem, and explain exactly how you resolved it.',
    ],
  },
  {
    category: 'Problem Solving & Innovation',
    color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: '🔧',
    questions: [
      'Tell me about a time when you identified a problem that others had overlooked.',
      'Describe a situation where you had to find a creative solution with limited resources or budget.',
      'Give me an example of when you implemented a significant improvement to a process, system, or procedure.',
      'Tell me about the most complex problem you have had to solve in your career.',
    ],
  },
  {
    category: 'Teamwork & Collaboration',
    color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7', icon: '🤝',
    questions: [
      'Tell me about a time when you worked on a cross-functional or interdepartmental team to achieve a goal.',
      'Describe a situation where you had a significant disagreement with a colleague and how you resolved it.',
      'Give me an example of when you had to subordinate your own preferences for the good of the team.',
      'Tell me about a time when you helped a struggling colleague without being asked to do so.',
    ],
  },
];

const DO_DONTS = {
  dos: [
    'Use past-tense opening questions ("Tell me about a time when…")',
    'Allow silence — give the candidate time to think before probing',
    'Take brief notes on each STAR component as the candidate speaks',
    'Probe with neutral follow-ups ("Tell me more about that")',
    'Ask about ONE specific situation per competency before moving on',
    'Listen for "I" statements that demonstrate personal ownership',
    'Redirect politely if the candidate gives a hypothetical response',
    'Clarify ambiguous pronouns: "When you say \'we,\' what did YOU specifically do?"',
    'Score only after the event is fully explored — not while the candidate is still speaking',
    'Calibrate with co-raters before the interview to align on scoring standards',
  ],
  donts: [
    'Do NOT ask leading questions ("Didn\'t you feel that was the right approach?")',
    'Do NOT accept hypothetical answers ("If that happened, I would…")',
    'Do NOT ask multiple questions at once — one probe at a time',
    'Do NOT interrupt before a complete STAR response is given',
    'Do NOT share your own experiences or opinions during the interview',
    'Do NOT let the candidate switch to a different, easier story midway',
    'Do NOT rush — each competency requires 10–15 minutes minimum under CBS BEI',
    'Do NOT make assumptions about missing STAR components without probing first',
    'Do NOT discuss scores with other raters before all individual scoring is complete',
    'Do NOT allow personal familiarity with the candidate to influence your rating',
  ],
};

const BEI_PROBING_TECHNIQUES = [
  {
    tech: 'Funnel Probe', icon: '🔽', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd',
    desc: 'Start broad, then narrow to specific behaviors. Opens the behavioral event.',
    examples: [
      '"Tell me about a time when you led a significant initiative in your office."',
      '"What specifically was the initiative you were leading?"',
      '"What did YOU personally do to get it started?"',
    ],
  },
  {
    tech: 'Thought & Feeling Probe', icon: '💭', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
    desc: 'Surfaces the candidate\'s internal state — a unique BEI element beyond basic STAR.',
    examples: [
      '"What were you thinking when you realized the situation was serious?"',
      '"How did you feel when your plan was challenged?"',
      '"What did you most want to achieve in that moment?"',
    ],
  },
  {
    tech: 'Clarification Probe', icon: '❓', color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7',
    desc: 'Clears up vague language, ambiguous pronouns, or unclear personal ownership.',
    examples: [
      '"When you say \'we,\' what specifically did YOU do?"',
      '"You mentioned \'managing the situation\' — what exactly did that involve, step by step?"',
      '"How long ago did this happen, and was this in your current position?"',
    ],
  },
  {
    tech: 'Completeness Probe', icon: '🧩', color: '#92400e', bg: '#fffbeb', border: '#fcd34d',
    desc: 'Fills in missing STAR components without leading the candidate.',
    examples: [
      '"You\'ve described the situation well — what was YOUR specific task or responsibility?"',
      '"You\'ve told me what happened — what were the actual outcomes or measurable results?"',
      '"What did you learn from that experience that you apply to your work today?"',
    ],
  },
  {
    tech: 'Redirect Probe', icon: '↩️', color: '#581c87', bg: '#faf5ff', border: '#d8b4fe',
    desc: 'Brings the candidate back when they give hypothetical or generic responses.',
    examples: [
      '"That\'s helpful context. Can you give me a specific example of when you actually did that?"',
      '"Are you describing something that actually happened, or what you would typically do?"',
      '"Let\'s focus on one specific event. Which situation comes to mind most clearly?"',
    ],
  },
  {
    tech: 'Depth Probe', icon: '⛏️', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5',
    desc: 'Pushes for more detail on a key action or decision. Used when the candidate skips critical steps.',
    examples: [
      '"You mentioned you \'coordinated with stakeholders\' — walk me through exactly how you did that."',
      '"What was the most difficult decision you had to make in that situation, and why?"',
      '"What specific obstacles did you encounter, and what did you do about each one?"',
    ],
  },
];

// ─── Fused STAR–BEI Guide Modal ───────────────────────────────────────────────
const STARBEIGuideModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSection, setExpandedSection] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview',    label: 'STAR Overview',      icon: '⭐', group: 'star' },
    { id: 'deep',        label: 'Component Deep Dive', icon: '🔬', group: 'star' },
    { id: 'bei_process', label: 'BEI Process',         icon: '🗺️', group: 'bei'  },
    { id: 'probing',     label: 'Probing Techniques',  icon: '🔎', group: 'bei'  },
    { id: 'scoring',     label: 'CBS Scoring Guide',   icon: '📊', group: 'cbs'  },
    { id: 'samples',     label: 'Sample Questions',    icon: '💬', group: 'cbs'  },
    { id: 'dodont',      label: "Do's & Don'ts",       icon: '✅', group: 'cbs'  },
    { id: 'bias',        label: 'Ethics & Bias',       icon: '⚖️', group: 'cbs'  },
  ];

  const groupColors  = { star: '#1d4ed8', bei: '#7c3aed', cbs: '#065f46' };
  const groupLabels  = { star: '⭐ STAR Method', bei: '🎯 BEI Technique', cbs: '📋 CBS Standards' };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 45%, #7c3aed 80%, #065f46 100%)',
          borderRadius: '16px 16px 0 0',
          padding: '20px 24px 16px',
          flexShrink: 0,
        }}>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span style={{ fontSize: 28 }}>🎯</span>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', margin: 0 }}>
                  STAR–BEI Interview Guide
                </h2>
              </div>
              <p style={{ color: '#93c5fd', fontSize: 12.5, margin: 0, fontWeight: 500 }}>
                Competency-Based Selection · DENR CBS Rating Standards · RHRMPSB 2025
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none',
                borderRadius: 8, cursor: 'pointer', padding: '6px 8px',
                color: '#fff', fontSize: 18, lineHeight: 1,
              }}
            >✕</button>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {CBS_RATING_SCALE.map(r => (
              <div key={r.score} style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontWeight: 900, fontSize: 14, color: '#fff' }}>{r.score}</span>
                <span style={{ fontSize: 10.5, color: '#bfdbfe', fontWeight: 600 }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', flexShrink: 0, overflowX: 'auto' }}>
          <div style={{ display: 'flex', padding: '6px 16px 0', gap: 20 }}>
            {['star', 'bei', 'cbs'].map(g => (
              <span key={g} style={{ fontSize: 9.5, fontWeight: 800, color: groupColors[g], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {groupLabels[g]}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 2, padding: '4px 16px 0' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 11px', borderRadius: '8px 8px 0 0',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11.5, fontWeight: activeTab === tab.id ? 700 : 500,
                  color: activeTab === tab.id ? groupColors[tab.group] : '#64748b',
                  background: activeTab === tab.id ? '#fff' : 'transparent',
                  borderBottom: activeTab === tab.id ? `2px solid ${groupColors[tab.group]}` : '2px solid transparent',
                  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, padding: '20px 24px 28px' }}>

          {/* STAR Overview */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '14px 18px' }}>
                <p style={{ fontSize: 13.5, color: '#1e40af', lineHeight: 1.65, margin: 0 }}>
                  <strong>STAR + BEI</strong> is the structured method used in DENR's Competency-Based Selection (CBS) to evaluate candidates through behavioral evidence. <strong>STAR</strong> is the framework that organizes what you hear; <strong>BEI</strong> (Behavioral Event Interviewing) is the technique you use to extract it. Together they produce the behavioral evidence needed to generate a valid CBS score.
                </p>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#78350f', marginBottom: 4 }}>The Golden Rule of CBS BEI</p>
                  <p style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6, margin: 0 }}>
                    You are evaluating <strong>what the candidate actually DID</strong> — not what they think, feel, believe, or would do. A rating of 5 (Outstanding) must be based on specific past behavioral events with verifiable results. Always redirect hypothetical responses back to a real past experience.
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {STAR_SECTIONS.map(s => (
                  <div key={s.letter} style={{ background: s.lightColor, border: `1.5px solid ${s.borderColor}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#fff', flexShrink: 0 }}>{s.letter}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: s.color }}>{s.word}</div>
                        <div style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{s.tagline}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: 18 }}>{s.icon}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: 0 }}>{s.description}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: 'linear-gradient(135deg, #ede9fe, #dbeafe)', border: '1.5px solid #a5b4fc', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🔗</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#312e81', marginBottom: 4 }}>How STAR and BEI Work Together in CBS</p>
                  <p style={{ fontSize: 12.5, color: '#1e1b4b', lineHeight: 1.65, margin: 0 }}>
                    STAR is the <strong>checklist</strong> you use to confirm completeness. BEI is the <strong>drill</strong> you use to extract depth. In a CBS panel interview: open with a BEI question → let the candidate respond → use STAR mentally to track what's present → probe for missing components → score against the CBS 1–5 adjectival scale.
                  </p>
                </div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '16px 18px' }}>
                <h3 style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>How to Use STAR–BEI in a CBS Panel Interview</h3>
                {[
                  'Select the CBS competency to assess (from the position\'s competency profile).',
                  'Ask an opening BEI question: "Tell me about a time when you had to [competency behavior]."',
                  'Listen without interrupting. Take notes using the STAR framework as your guide.',
                  'Probe for missing or thin components using BEI techniques (see Probing Techniques tab).',
                  'Explicitly ask about thoughts and feelings — a unique BEI element that reveals motivation.',
                  'Score the response using the CBS 1–5 scale tied to adjectival ratings (Outstanding → Poor).',
                  'Move to the next competency. Never mix events across competencies.',
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                    <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.55, margin: 0 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Component Deep Dive */}
          {activeTab === 'deep' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 4px', lineHeight: 1.55 }}>
                Click each component to expand detailed guidance, probe questions, and CBS-specific red flags.
              </p>
              {STAR_SECTIONS.map((s, idx) => {
                const open = expandedSection === idx;
                return (
                  <div key={s.letter} style={{ border: `1.5px solid ${open ? s.color : s.borderColor}`, borderRadius: 12, overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpandedSection(open ? null : idx)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: open ? s.lightColor : '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#fff' }}>{s.letter}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: s.color }}>{s.word}</div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.tagline}</div>
                      </div>
                      <span style={{ fontSize: 18 }}>{s.icon}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>
                    {open && (
                      <div style={{ padding: '0 16px 16px', background: s.lightColor }}>
                        <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, marginBottom: 14, paddingTop: 10 }}>{s.description}</p>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 6 }}>🎙️ Interviewer Tips</div>
                          {s.interviewerTips.map((tip, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                              <span style={{ color: s.color, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>•</span>
                              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: 0 }}>{tip}</p>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 6 }}>❓ Probe Questions</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {s.probeQuestions.map((q, i) => (
                              <div key={i} style={{ background: 'rgba(255,255,255,0.7)', border: `1px solid ${s.borderColor}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#1e293b', fontStyle: 'italic' }}>{q}</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: '#dc2626', marginBottom: 6 }}>🚩 CBS Red Flags</div>
                          {s.redFlags.map((flag, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                              <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>!</span>
                              <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5, margin: 0 }}>{flag}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* BEI Process */}
          {activeTab === 'bei_process' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  A CBS BEI follows a disciplined 5-phase structure. Skipping phases produces incomplete behavioral evidence and unreliable CBS ratings that cannot withstand CSC review.
                </p>
              </div>
              {[
                {
                  phase: '01', title: 'Preparation', time: 'Before the interview',
                  color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', icon: '📋',
                  steps: [
                    'Review the CBS competency framework and indicators for the target position',
                    'Select 3–5 competencies to probe (prioritize those most critical to the role)',
                    'Prepare one opening BEI question per competency',
                    'Prepare 3–4 probe questions per competency in case the story is incomplete',
                    'Review the candidate\'s application materials — do NOT form premature ratings',
                    'Set up a private, distraction-free interview space',
                    'Inform the candidate in advance that the interview uses a structured behavioral format',
                  ],
                  tip: 'Never improvise during a CBS BEI. Prepared, standardized questions ensure consistency across all candidates and reduce bias.',
                },
                {
                  phase: '02', title: 'Opening & Rapport', time: '5–10 minutes',
                  color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7', icon: '🤝',
                  steps: [
                    'Welcome the candidate and introduce all panel members',
                    'Explain the interview format: "We will be asking you about specific past situations."',
                    'Normalize the process: "There are no right or wrong answers — we want your real experiences."',
                    'Explain note-taking: "I will take notes to accurately capture your responses."',
                    'Set time expectations: "We have about [X] minutes. I may redirect us to stay on track."',
                    'Ask a brief warm-up question (current role, years in service) to ease tension',
                  ],
                  tip: 'Psychological safety matters. A nervous candidate produces shorter, less detailed responses. Investing 2 extra minutes here saves 10 minutes of probing later.',
                },
                {
                  phase: '03', title: 'Core BEI Questioning', time: '30–60 minutes',
                  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: '🔍',
                  steps: [
                    'Ask the opening BEI question for the first CBS competency',
                    'Allow the candidate to respond fully without interruption',
                    'Mentally check which STAR components are present in the response',
                    'Probe for missing or thin components using the BEI probing techniques',
                    'Explicitly capture: What were you thinking? What were you feeling? What did YOU decide?',
                    'Confirm the outcome and ask for the candidate\'s reflection or learning',
                    'When the event is fully explored, move to the next competency — one event at a time',
                    'For critical competencies, ask for a second event to establish a pattern',
                  ],
                  tip: 'Do not move to the next competency until you have a complete S-T-A-R narrative with personal thoughts/feelings included. One complete event is the minimum for a valid CBS score above 2.',
                },
                {
                  phase: '04', title: 'Closing', time: '5 minutes',
                  color: '#92400e', bg: '#fffbeb', border: '#fcd34d', icon: '🎬',
                  steps: [
                    'Summarize what was covered: "We have assessed [X] competencies today."',
                    'Ask if the candidate has anything to add relevant to their competency profile',
                    'Thank the candidate for their time and openness',
                    'Explain next steps in the CBS selection process',
                    'Do NOT give any feedback on their performance — the selection is ongoing',
                    'Maintain a neutral, consistent expression and tone regardless of your impressions',
                  ],
                  tip: 'Never signal approval or concern during the closing. Any cue can affect the candidate\'s behavior in remaining stages of the Merit Selection Process.',
                },
                {
                  phase: '05', title: 'CBS Scoring & Documentation', time: 'Immediately after',
                  color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', icon: '📝',
                  steps: [
                    'Score each competency immediately after the interview while memory is fresh',
                    'Use only behavioral evidence from the interview — not credentials, appearance, or gut feel',
                    'For each competency: (a) identify the event, (b) cite specific behaviors, (c) assign a CBS score, (d) write the rationale',
                    'Score independently before discussing with co-raters to avoid anchoring bias',
                    'For scores 2+ points apart between raters: each must cite specific behavioral evidence, then re-evaluate',
                    'Document the rationale for every score — especially for 5 (Outstanding) or 1 (Poor)',
                    'Flag any competency where insufficient evidence was gathered for a reliable CBS score',
                  ],
                  tip: 'CBS scores without documented behavioral evidence are indefensible. If challenged in a CSC appeal, you must be able to cite exactly what the candidate said or did that justified each rating.',
                },
              ].map((ph, i) => (
                <div key={i} style={{ border: `1.5px solid ${ph.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: ph.bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: ph.color, color: '#fff', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ph.phase}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: ph.color }}>{ph.icon} Phase {ph.phase}: {ph.title}</div>
                      <div style={{ fontSize: 11, color: ph.color, opacity: 0.8, fontWeight: 600 }}>{ph.time}</div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', background: '#fff' }}>
                    {ph.steps.map((s, si) => (
                      <div key={si} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <span style={{ color: ph.color, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>✓</span>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: 0 }}>{s}</p>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, background: ph.bg, border: `1px solid ${ph.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                      <p style={{ fontSize: 11.5, color: ph.color, lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>{ph.tip}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Probing Techniques */}
          {activeTab === 'probing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  Probing is what separates a trained CBS BEI rater from an untrained one. The goal is to exhaust the behavioral event — not just confirm it. Use these techniques whenever a candidate's response is incomplete, vague, or hypothetical.
                </p>
              </div>
              {BEI_PROBING_TECHNIQUES.map((t, i) => (
                <div key={i} style={{ border: `1.5px solid ${t.border}`, borderRadius: 12 }}>
                  <div style={{ background: t.bg, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{t.icon}</span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: 13, color: t.color }}>{t.tech}</span>
                      <p style={{ fontSize: 11.5, color: t.color, opacity: 0.85, margin: '2px 0 0', lineHeight: 1.4 }}>{t.desc}</p>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {t.examples.map((ex, ei) => (
                      <div key={ei} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#1e293b', fontStyle: 'italic' }}>{ex}</div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 10 }}>⚡ Handling Difficult Responses</h3>
                {[
                  { s: 'Candidate gives a hypothetical answer', r: 'Say: "That\'s helpful context. Can you tell me about a specific time when you actually did this?" Then wait.' },
                  { s: 'Candidate goes off-topic or rambles', r: 'Gently redirect: "That\'s interesting. Let me bring you back — what did YOU specifically do in that situation?"' },
                  { s: 'Candidate cannot think of an example', r: '"Take your time. Think of any situation in your career — even a small or early one — where you demonstrated this."' },
                  { s: 'Candidate describes group effort only', r: '"I understand the team was involved. What was YOUR specific contribution or decision in those actions?"' },
                  { s: 'Response is too brief for a CBS score', r: '"Can you tell me a bit more about what you specifically did? Walk me through it step by step."' },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: i < 4 ? 10 : 0, paddingBottom: i < 4 ? 10 : 0, borderBottom: i < 4 ? '1px solid #fde68a' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#b45309', marginBottom: 3 }}>If: {item.s}</div>
                    <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>→ {item.r}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#991b1b', marginBottom: 10 }}>🚫 Probing Pitfalls to Avoid</h3>
                {[
                  { bad: 'Leading probes', fix: 'Keep probes neutral: "What did you do next?" not "You handled that professionally, didn\'t you?"' },
                  { bad: 'Double-barreled probes', fix: 'Ask one thing at a time: not "What did you do and what did you learn?"' },
                  { bad: 'Closed probes', fix: 'Use open probes: "What happened next?" not "Did you talk to your supervisor?"' },
                  { bad: 'Sharing your own experiences', fix: 'Stay neutral. Never compare yourself to the candidate.' },
                  { bad: 'Accepting generalities for CBS scoring', fix: 'Always redirect to a specific event before assigning a CBS score.' },
                ].map((p, i) => (
                  <div key={i} style={{ marginBottom: i < 4 ? 10 : 0, paddingBottom: i < 4 ? 10 : 0, borderBottom: i < 4 ? '1px solid #fecaca' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#991b1b', marginBottom: 2 }}>❌ {p.bad}</div>
                    <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>✓ {p.fix}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CBS Scoring Guide */}
          {activeTab === 'scoring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>
                  CBS scores must be based on the <strong>quality and completeness of the behavioral evidence</strong>, not on how impressive the story sounds or how senior the candidate is. A modest situation with a fully articulated STAR–BEI response scores higher than a grand-sounding but vague answer.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                {CBS_RATING_SCALE.map(r => (
                  <div key={r.score} style={{ flex: 1, background: r.bg, border: `2px solid ${r.border}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 900, fontSize: 22, color: r.color, lineHeight: 1 }}>{r.score}</div>
                    <div style={{ fontWeight: 700, fontSize: 10, color: r.color, marginTop: 3, lineHeight: 1.2 }}>{r.label}</div>
                  </div>
                ))}
              </div>
              {CBS_RATING_SCALE.map(r => (
                <div key={r.score} style={{ background: r.bg, border: `1.5px solid ${r.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: r.color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <span style={{ fontWeight: 900, fontSize: 20, lineHeight: 1 }}>{r.score}</span>
                    <span style={{ fontWeight: 800, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>{r.shortLabel}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: r.color, marginBottom: 5 }}>{r.label}</div>
                    <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: '0 0 8px' }}>{r.description}</p>
                    <div style={{ background: 'rgba(255,255,255,0.7)', border: `1px solid ${r.border}`, borderRadius: 8, padding: '7px 10px' }}>
                      <div style={{ fontWeight: 700, fontSize: 11, color: r.color, marginBottom: 3 }}>🎯 BEI Evidence Anchor</div>
                      <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>{r.beiAnchor}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>✅ CBS Scoring Checklist (Before Assigning a Score)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Situation is specific, real, and past-tense', comp: 'S', color: '#1d4ed8' },
                    { label: 'Candidate\'s personal role is clearly defined', comp: 'T', color: '#065f46' },
                    { label: 'Actions described in concrete, personal steps', comp: 'A', color: '#92400e' },
                    { label: 'Results are measurable and attributed to candidate', comp: 'R', color: '#581c87' },
                    { label: 'Actions match the CBS competency being assessed', comp: 'A', color: '#92400e' },
                    { label: 'Candidate shows thoughts, feelings, and reflection', comp: 'R', color: '#581c87' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, color: '#fff' }}>{item.comp}</div>
                      <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.45, margin: 0 }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#0c4a6e', marginBottom: 10 }}>👥 CBS Panel Scoring & Consensus</h3>
                {[
                  'Each rater scores INDEPENDENTLY before discussing with the panel — prevents anchoring bias.',
                  'Disclose individual scores simultaneously (e.g., using written sheets or cards).',
                  'For scores within 1 point of each other: average the scores.',
                  'For scores 2+ points apart: each rater must cite specific behavioral evidence, then re-evaluate.',
                  'The final CBS score must be justified by behavioral evidence — not by seniority or social pressure.',
                  'Document the rationale, especially when raters disagreed and how it was resolved.',
                ].map((rule, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: '#0369a1', fontWeight: 800, fontSize: 12, flexShrink: 0, lineHeight: 1.7 }}>{i + 1}.</span>
                    <p style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.55, margin: 0 }}>{rule}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample Questions */}
          {activeTab === 'samples' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>
                  These are <strong>CBS BEI opening questions</strong> aligned to DENR competency areas. After the candidate responds, use the probe questions from the <em>Probing Techniques</em> tab to fill in missing STAR components and extract thoughts/feelings.
                </p>
              </div>
              {CBS_SAMPLE_QUESTIONS.map((cat, i) => (
                <div key={i} style={{ background: cat.bg, border: `1.5px solid ${cat.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{cat.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: cat.color }}>{cat.category}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {cat.questions.map((q, qi) => (
                      <div key={qi} style={{ background: 'rgba(255,255,255,0.75)', border: `1px solid ${cat.border}`, borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: cat.color, fontWeight: 800, fontSize: 12, flexShrink: 0, lineHeight: 1.6 }}>{qi + 1}.</span>
                        <p style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>"{q}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Do's & Don'ts */}
          {activeTab === 'dodont' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✅</div>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#065f46' }}>DO</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {DO_DONTS.dos.map((item, i) => (
                      <div key={i} style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: '#065f46', fontSize: 13, flexShrink: 0, fontWeight: 800, lineHeight: 1.5 }}>✓</span>
                        <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.5, margin: 0 }}>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🚫</div>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#991b1b' }}>DON'T</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {DO_DONTS.donts.map((item, i) => (
                      <div key={i} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: '#991b1b', fontSize: 13, flexShrink: 0, fontWeight: 800, lineHeight: 1.5 }}>✕</span>
                        <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5, margin: 0 }}>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ethics & Bias */}
          {activeTab === 'bias' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: 12, padding: '12px 16px' }}>
                <p style={{ fontSize: 12.5, color: '#3b0764', lineHeight: 1.6, margin: 0 }}>
                  Even structured CBS BEIs are vulnerable to cognitive bias. Recognizing and actively managing bias is a professional obligation under the DENR Merit Selection and Promotion Plan (MSPP) and CSC rules.
                </p>
              </div>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 10 }}>Common Rater Biases in CBS BEI</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { bias: 'Halo Effect', icon: '😇', color: '#7c3aed', desc: 'One strong response inflates scores for all subsequent competencies.', fix: 'Score each competency immediately and independently. Do not carry early impressions into later ratings.' },
                    { bias: 'Horns Effect', icon: '😈', color: '#991b1b', desc: 'One weak response deflates all subsequent competency scores.', fix: 'Same as above — each CBS competency must be scored solely on its own behavioral evidence.' },
                    { bias: 'Similar-to-Me Bias', icon: '🪞', color: '#1d4ed8', desc: 'Raters unconsciously favor candidates who share their background, style, or alma mater.', fix: 'Ask: "Is my score based on what they DID, or how much they remind me of myself?" Focus on behavioral evidence only.' },
                    { bias: 'Contrast Effect', icon: '⚖️', color: '#065f46', desc: 'Rating a candidate relative to the previous interviewee rather than against the CBS standard.', fix: 'Always score against the CBS rubric and adjectival anchors — not against other candidates.' },
                    { bias: 'Leniency / Strictness Bias', icon: '📏', color: '#0c4a6e', desc: 'Some raters consistently score too high (to avoid conflict) or too low (being overly critical).', fix: 'Calibrate with co-raters before the interview. Justify every score of 5 or 1 with specific behavioral evidence.' },
                    { bias: 'First Impression Bias', icon: '⏱️', color: '#581c87', desc: 'The first story shared has a disproportionate impact on the overall assessment.', fix: 'Use a structured scoring form. Finalize scores per competency after probing is complete — not after the first response.' },
                  ].map((b, i) => (
                    <div key={i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: '#f8fafc' }}>
                        <span style={{ fontSize: 20 }}>{b.icon}</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: b.color }}>{b.bias}</span>
                      </div>
                      <div style={{ padding: '10px 14px', background: '#fff' }}>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, margin: '0 0 6px' }}>{b.desc}</p>
                        <div style={{ display: 'flex', gap: 7, background: '#f0fdf4', borderRadius: 7, padding: '6px 10px', border: '1px solid #bbf7d0' }}>
                          <span style={{ color: '#065f46', fontSize: 12, fontWeight: 800, flexShrink: 0, lineHeight: 1.6 }}>✓</span>
                          <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.55, margin: 0 }}><strong>Mitigation:</strong> {b.fix}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 10 }}>⚖️ DENR MSPP Obligations of CBS Raters</h3>
                {[
                  { title: 'Confidentiality', body: 'All interview content — questions, answers, and CBS scores — is strictly confidential. Disclosure to non-panel members or candidates violates DENR MSPP and CSC rules.' },
                  { title: 'Non-discrimination', body: 'Questions must be competency-relevant only. Never ask about age, civil status, pregnancy, religion, or political affiliation.' },
                  { title: 'Consistency', body: 'The same CBS competencies must be assessed for all candidates applying for the same position. Varying questions across candidates invalidates the CBS process.' },
                  { title: 'Documentation', body: 'All CBS scoring sheets, behavioral notes, and score rationales must be preserved as official selection records — subject to CSC audit and FOI requests.' },
                  { title: 'Conflict of Interest', body: 'A rater with a personal or professional relationship with a candidate that could affect objectivity must declare this and recuse themselves from that candidate\'s panel.' },
                  { title: 'Independent Scoring', body: 'Raters must not discuss CBS scores before all individual scoring is complete. Premature discussion introduces social pressure and compromises the integrity of the RHRMPSB process.' },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: i < 5 ? 10 : 0, paddingBottom: i < 5 ? 10 : 0, borderBottom: i < 5 ? '1px solid #fed7aa' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#92400e', marginBottom: 3 }}>{item.title}</div>
                    <p style={{ fontSize: 12, color: '#7c2d12', lineHeight: 1.6, margin: 0 }}>{item.body}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px 18px' }}>
                <h3 style={{ fontWeight: 800, fontSize: 13, color: '#065f46', marginBottom: 10 }}>✅ CBS Rater Self-Check Before Submitting Scores</h3>
                {[
                  'Is my score based on specific behavioral evidence from THIS interview — not my pre-existing impression?',
                  'Can I cite at least one specific thing the candidate SAID or DID that justifies each CBS score?',
                  'Did I probe sufficiently before concluding that behavioral evidence was absent?',
                  'Am I scoring against the CBS adjectival rubric — not against other candidates I have interviewed?',
                  'Have I checked for halo/horns effect by reviewing each competency score independently?',
                  'Am I confident this score would withstand a CSC review or MSPP-level challenge?',
                ].map((q, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid #16a34a', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.55, margin: 0 }}>{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{
          flexShrink: 0, padding: '10px 20px',
          borderTop: '1.5px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: '0 0 16px 16px',
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            STAR–BEI Guide · CBS Standards · DENR CALABARZON RHRMPSB 2025 · For Authorized Raters Only
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: 8,
              background: '#1d4ed8', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Password Change Modal ────────────────────────────────────────────────────
const PasswordChangeModal = ({ isOpen, onClose, selectedUser, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword.trim()) { setError('New password is required'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters long'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setIsLoading(true);
    try {
      const result = await usersAPI.changePassword(selectedUser._id, newPassword);
      onSuccess(result.message);
      handleClose();
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewPassword(''); setConfirmPassword(''); setError(''); setShowPasswords(false); onClose();
  };

  if (!isOpen || !selectedUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Change Password</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600"><span className="font-medium">User:</span> {selectedUser.name}</p>
          <p className="text-sm text-gray-600"><span className="font-medium">Email:</span> {selectedUser.email}</p>
          <p className="text-sm text-gray-600"><span className="font-medium">Role:</span> {selectedUser.userType}</p>
        </div>
        {error && <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-600">{error}</p></div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder="Enter new password" disabled={isLoading} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder="Confirm new password" disabled={isLoading} required />
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="showPasswords" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
            <label htmlFor="showPasswords" className="ml-2 block text-sm text-gray-600">Show passwords</label>
          </div>
          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
            <p className="font-medium mb-1">Password Requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>At least 6 characters long</li>
              <li>User will need to log in again with the new password</li>
            </ul>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={handleClose} disabled={isLoading} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center">
              {isLoading ? (
                <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Changing...</>
              ) : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Creator Profile Modal ────────────────────────────────────────────────────
const CreatorProfileModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800 text-center flex-1">About the Developer</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="text-center space-y-4">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/profile.jpg?raw=true"
            alt="Creator Photo"
            className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-gray-200 shadow-sm"
            onError={(e) => { e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjY0IiBjeT0iNDQiIHI9IjIwIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiA5NkMzMiA4MC41MzYgNDQuNTM2IDY4IDYwIDY4aDhDODMuNDY0IDY4IDk2IDgwLjUzNiA5NiA5NnYzMkgzMlY5NloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+'; }}
          />
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Dan Christian Bonacua Sabao, LPT, CHRM</h2>
            <p className="text-blue-600 font-medium text-sm">Administrative Officer I | DENR IV-A</p>
          </div>
          <div className="space-y-3">
            <div className="flex justify-center items-center">
              <span className="mr-2 text-lg">📧</span>
              <a href="mailto:dan.c.b.sabao.adm@gmail.com" className="text-blue-600 hover:text-blue-800 text-sm">dan.c.b.sabao.adm@gmail.com</a>
            </div>
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 text-sm mb-2">Support My Work</h4>
              <div className="space-y-1 text-sm">
                <p><strong>PayMaya:</strong> @vlax</p>
                <p><strong>PayPal:</strong> <a href="https://paypal.me/tetralax" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">paypal.me/tetralax</a></p>
              </div>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              Developer of the <strong>DENR CALABARZON Competency-Based Rating System</strong>, leveraging expertise in VBA, JavaScript, and systems integration to deliver efficient, user-friendly digital solutions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── User Selection Modal ─────────────────────────────────────────────────────
const UserSelectionModal = ({ isOpen, onClose, users, onSelectUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userType.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleClose = () => { setSearchTerm(''); onClose(); };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Select User</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb-4">
          <input type="text" placeholder="Search users by name, email, or role..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div key={user._id} onClick={() => { onSelectUser(user); handleClose(); }} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-800">{user.userType}</div>
                    {user.raterType && <div className="text-xs text-gray-500">{user.raterType}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredUsers.length === 0 && <div className="text-center py-8"><p className="text-gray-500 text-sm">No users found</p></div>}
        </div>
      </div>
    </div>
  );
};

// ─── Guides Dropdown ──────────────────────────────────────────────────────────
const GuidesDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const guides = [
    { name: 'MSPP', fullName: 'DENR Merit Selection and Promotion Plan', url: 'https://drive.google.com/file/d/1YhjcPs2o37592n9-a14YEHbWcx36yMdY/view?usp=sharing' },
    { name: 'ORAOHRA', fullName: '2025 Omnibus Rules on Human Resources and Other Human Resource Actions', url: 'https://drive.google.com/file/d/1osaiwsNm5KRBxKYDl7dXcrSITKOi-2JD/view?usp=sharing' },
    { name: 'SRP', fullName: '2025 System of Ranking Positions', url: 'https://drive.google.com/file/d/1jwSut541U2V6fRrPPvcMO1wFMj9tK-2T/view?usp=sharing' },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="navbar-button bg-green-600 text-white hover:bg-green-700 flex items-center gap-1" title="View Guides">
        Guides
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
          {guides.map((guide, index) => (
            <a key={index} href={guide.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100" onClick={() => setIsOpen(false)}>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{guide.name}</div>
                  <div className="text-xs text-gray-600 mt-0.5 leading-tight">{guide.fullName}</div>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [userSelectionModal, setUserSelectionModal] = useState(false);
  const [passwordChangeModal, setPasswordChangeModal] = useState({ isOpen: false, user: null });
  const [successMessage, setSuccessMessage] = useState('');
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);
  const [logoutConfirmModalOpen, setLogoutConfirmModalOpen] = useState(false);
  const [starBEIGuideOpen, setStarBEIGuideOpen] = useState(false);

  useEffect(() => {
    if (user.userType === USER_TYPES.ADMIN) fetchUsers();
  }, [user.userType]);

  const fetchUsers = async () => {
    try {
      const userData = await usersAPI.getAll();
      setUsers(userData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleLogout = () => {
    const hasUnsavedRatings = user.userType === USER_TYPES.RATER &&
      sessionStorage.getItem(`rater_${user._id}_hasUnsavedRatings`) === 'true';
    if (hasUnsavedRatings) {
      setLogoutConfirmModalOpen(true);
    } else {
      performLogout();
    }
  };

  const performLogout = () => {
    localStorage.removeItem(`rater_${user._id}_selectedAssignment`);
    localStorage.removeItem(`rater_${user._id}_selectedPosition`);
    localStorage.removeItem(`rater_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`rater_${user._id}_selectedCandidate`);
    localStorage.removeItem(`secretariat_${user._id}_selectedAssignment`);
    localStorage.removeItem(`secretariat_${user._id}_selectedPosition`);
    localStorage.removeItem(`secretariat_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`secretariat_${user._id}_selectedCandidate`);
    localStorage.removeItem(`admin_${user._id}_activeTab`);
    sessionStorage.removeItem(`rater_${user._id}_hasUnsavedRatings`);
    onLogout();
  };

  const handleOpenUserSelection = () => setUserSelectionModal(true);
  const handleCloseUserSelection = () => setUserSelectionModal(false);
  const handleSelectUser = (selectedUser) => setPasswordChangeModal({ isOpen: true, user: selectedUser });
  const handleClosePasswordModal = () => setPasswordChangeModal({ isOpen: false, user: null });
  const handlePasswordChangeSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  const renderContent = () => {
    switch (user.userType) {
      case USER_TYPES.RATER:      return <RaterView user={user} />;
      case USER_TYPES.SECRETARIAT: return <SecretariatView user={user} />;
      case USER_TYPES.ADMIN:      return <AdminView user={user} />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
              <p className="text-gray-600">Invalid user type</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="navbar sticky top-0 z-50 shadow-md">
        <div className="navbar-title-container">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/denr-logo.png?raw=true"
            alt="DENR Logo"
            className="w-6 h-6 mr-1 object-contain"
            onError={(e) => { e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+Cjwvc3ZnPg=='; }}
          />
          <h1 className="navbar-title">The DENR CALABARZON Competency-Based Rating System</h1>
          <span className="navbar-user-type">
            {user.userType.charAt(0).toUpperCase() + user.userType.slice(1)}
          </span>
        </div>
        <div className="navbar-buttons">
          <span className="navbar-welcome">{user.name}</span>
          <button onClick={() => setCreatorModalOpen(true)} className="navbar-button bg-blue-600 text-white hover:bg-blue-700" title="About the Developer">
            About
          </button>
          <GuidesDropdown />
          {user.userType === USER_TYPES.RATER && (
            <button
              onClick={() => setStarBEIGuideOpen(true)}
              className="navbar-button text-white"
              style={{ background: '#7c3aed' }}
              title="STAR–BEI Interview Guide"
            >
              🎯 Interview Guide
            </button>
          )}
          {user.userType === USER_TYPES.ADMIN && (
            <button onClick={handleOpenUserSelection} className="navbar-button bg-orange-600 text-white hover:bg-orange-700" title="Change user password">
              Password
            </button>
          )}
          <button onClick={handleLogout} className="navbar-button btn-secondary">Logout</button>
        </div>
      </nav>

      {successMessage && (
        <div className="mx-6 mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <svg className="flex-shrink-0 h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-green-700 font-medium">{successMessage}</p>
            </div>
            <div className="ml-auto pl-3">
              <button onClick={() => setSuccessMessage('')} className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none">
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="p-6">{renderContent()}</main>

      <CreatorProfileModal isOpen={creatorModalOpen} onClose={() => setCreatorModalOpen(false)} />

      <UserSelectionModal isOpen={userSelectionModal} onClose={handleCloseUserSelection} users={users} onSelectUser={handleSelectUser} />

      <PasswordChangeModal isOpen={passwordChangeModal.isOpen} onClose={handleClosePasswordModal} selectedUser={passwordChangeModal.user} onSuccess={handlePasswordChangeSuccess} />

      {/* Fused STAR–BEI Guide — raters only */}
      {user.userType === USER_TYPES.RATER && (
        <STARBEIGuideModal isOpen={starBEIGuideOpen} onClose={() => setStarBEIGuideOpen(false)} />
      )}

      {logoutConfirmModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Confirm Logout</h3>
              <p className="text-lg text-gray-600 mb-6">
                You have unsubmitted ratings that will be lost if you logout now. Are you sure you want to continue?
              </p>
              <div className="flex justify-center gap-4">
                <button onClick={() => setLogoutConfirmModalOpen(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 text-lg font-semibold">Cancel</button>
                <button onClick={performLogout} className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg font-semibold">Logout Anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
