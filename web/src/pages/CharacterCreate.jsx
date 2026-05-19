import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import ClassDiePicker from '../components/character/ClassDiePicker';
import { useSignalR } from '../hooks/useSignalR';
import { useNavbar } from '../context/NavbarContext';
import { useAbilityScoreEngine } from '../hooks/useAbilityScoreEngine';
import { useRerollApproval } from '../hooks/useRerollApproval';
import { rollDice } from '../utils/diceRoller';

const RACES = [
  'Human', 'High Elf', 'Wood Elf', 'Dark Elf (Drow)',
  'Mountain Dwarf', 'Hill Dwarf',
  'Lightfoot Halfling', 'Stout Halfling',
  'Rock Gnome', 'Forest Gnome',
  'Half-Elf', 'Half-Orc',
  'Dragonborn', 'Tiefling',
];

const CLASSES = [
  { name: 'Barbarian', hit_die: 12 },
  { name: 'Bard', hit_die: 8 },
  { name: 'Cleric', hit_die: 8 },
  { name: 'Druid', hit_die: 8 },
  { name: 'Fighter', hit_die: 10 },
  { name: 'Monk', hit_die: 8 },
  { name: 'Paladin', hit_die: 10 },
  { name: 'Ranger', hit_die: 10 },
  { name: 'Rogue', hit_die: 8 },
  { name: 'Sorcerer', hit_die: 6 },
  { name: 'Warlock', hit_die: 8 },
  { name: 'Wizard', hit_die: 6 },
];

const BACKGROUNDS = [
  'Acolyte', 'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero',
  'Guild Artisan', 'Hermit', 'Noble', 'Outlander', 'Sage',
  'Sailor', 'Soldier', 'Urchin',
];

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

const RACE_SPEED = {
  'Mountain Dwarf': 25, 'Hill Dwarf': 25,
  'Lightfoot Halfling': 25, 'Stout Halfling': 25,
  'Rock Gnome': 25, 'Forest Gnome': 25,
};

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_SHORT = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

function mod(score) {
  return Math.floor((score - 10) / 2);
}

function proficiencyBonus(level) {
  return Math.floor((level - 1) / 4) + 2;
}

const INITIAL_SCORES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };


export default function CharacterCreate({ user }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCenterContent } = useNavbar();

  const [step, setStep] = useState(() => searchParams.get('step') === '2' ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [maxLevel, setMaxLevel] = useState(null); // null = loading
  const [creatorEmails, setCreatorEmails] = useState([]);
  const [abilityScoreMethod, setAbilityScoreMethod] = useState('standard_array');
  const [abilityScoreRules, setAbilityScoreRules] = useState({ standard_array: [15, 14, 13, 12, 10, 8] });
  const [confirmAction, setConfirmAction] = useState(null); // 'leave' | 'cancel' | null
  const [actioning, setActioning] = useState(false);
  const [hasRerolled, setHasRerolled] = useState(false);
  const [confirmingChipIdx, setConfirmingChipIdx] = useState(null);
  const [campaignLoaded, setCampaignLoaded] = useState(false);

  const [identity, setIdentity] = useState({
    name: '',
    race: RACES[0],
    class_name: CLASSES[0].name,
    background: BACKGROUNDS[0],
    alignment: 'True Neutral',
    level: 1,
    backstory: '',
  });

  const [scores, setScores] = useState(INITIAL_SCORES);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const engine = useAbilityScoreEngine({
    ability_score_method: abilityScoreMethod,
    ability_score_rules: abilityScoreRules,
  });

  const isStandardArray = abilityScoreMethod === 'standard_array' || !abilityScoreMethod;
  const isPointBuy = abilityScoreMethod === 'point_buy';
  const isRollForStats = abilityScoreMethod === 'roll_for_stats';
  const useEngine = isStandardArray || isPointBuy || isRollForStats;
  const activeScores = useEngine
    ? Object.fromEntries(ABILITY_KEYS.map((k) => [k, engine.scores[k] ?? (isPointBuy ? 8 : 10)]))
    : scores;

  const rollDiceCount = abilityScoreRules.roll_dice ?? 4;
  const rollKeepCount = abilityScoreRules.roll_keep ?? 3;

  const doRoll = () => {
    const result = rollDice({ sides: 6, count: rollDiceCount, keep: rollKeepCount });
    engine.recordRoll(result);
  };

  const doRollAll = async () => {
    for (let i = 0; i < 6; i++) {
      doRoll();
      if (i < 5) await new Promise((r) => setTimeout(r, 150));
    }
  };

  useEffect(() => {
    api.getCampaign(campaignId)
      .then((c) => {
        const max = c.max_starting_level ?? 20;
        setMaxLevel(max);
        setCreatorEmails(c.creator_emails ?? []);
        setIdentity((i) => ({ ...i, level: max }));
        setAbilityScoreMethod(c.ability_score_method ?? 'standard_array');
        setAbilityScoreRules(c.ability_score_rules ?? { standard_array: [15, 14, 13, 12, 10, 8] });
        setCampaignLoaded(true);
      })
      .catch(() => { setMaxLevel(20); setCampaignLoaded(true); });
  }, [campaignId]);

  useEffect(() => {
    if (!campaignLoaded) return;
    api.getDraft(campaignId)
      .then((draft) => {
        if (!draft) return;
        if (draft.identity) setIdentity(draft.identity);
        if (draft.step === 2) setStep(2);
        engine.restoreFromDraft({
          scores: draft.scores,
          availableChips: draft.available_chips,
          rollResults: draft.roll_results,
        });
      })
      .catch(() => {});
  }, [campaignLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const myEmail = user?.userDetails;
  const iAmCreator = creatorEmails.includes(myEmail);

  const draftRef = useRef(null);
  draftRef.current = {
    step,
    identity,
    scores: engine.scores,
    available_chips: engine.availableChips,
    roll_results: engine.rollResults,
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      fetch(`/api/campaigns/${campaignId}/character/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftRef.current),
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = async () => {
    await api.saveDraft(campaignId, { ...draftRef.current, step: 2 }).catch(() => {});
    setStep(2);
  };

  const handleBack = async () => {
    await api.saveDraft(campaignId, { ...draftRef.current, step: 1 }).catch(() => {});
    setStep(1);
  };

  useEffect(() => {
    const totalSteps = iAmCreator ? 3 : 2;
    const currentStep = iAmCreator ? 2 : 1;
    setCenterContent(
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>Step {currentStep} of {totalSteps}</span>
        <button
          className="btn btn-sm"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent', fontSize: 11, padding: '2px 6px', whiteSpace: 'nowrap' }}
          onClick={() => setConfirmAction(iAmCreator ? 'cancel' : 'leave')}
        >
          {iAmCreator ? 'Cancel' : 'Leave'}
        </button>
      </div>
    );
    return () => setCenterContent(null);
  }, [iAmCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  const { setPendingRerollRequest } = useNavbar();

  useSignalR(campaignId, {
    onLobbyEvent: (event) => {
      if (event.type === 'campaign_deleted') {
        navigate('/', { replace: true });
      }
      if (event.type === 'reroll_request' && iAmCreator) {
        setPendingRerollRequest({ ...event, campaignId });
      }
    },
  });

  const reroll = useRerollApproval({
    campaignId,
    myEmail,
    onApproved: (oldValue) => {
      const result = rollDice({ sides: 6, count: rollDiceCount, keep: rollKeepCount });
      engine.rerollChip(oldValue, result);
      engine.markRerolled(
        ABILITY_KEYS.find((k) => engine.scores[k] === oldValue) ?? ABILITY_KEYS[0]
      );
      setHasRerolled(true);
    },
  });

  const handleConfirmedAction = async () => {
    setActioning(true);
    try {
      if (confirmAction === 'cancel') {
        await api.deleteCampaign(campaignId);
      } else {
        await api.leaveCampaign(campaignId);
      }
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Action failed:', err);
      setActioning(false);
      setConfirmAction(null);
    }
  };

  const selectedClass = CLASSES.find((c) => c.name === identity.class_name) || CLASSES[0];
  const conMod = mod(activeScores.constitution);
  const dexMod = mod(activeScores.dexterity);
  const level = Math.max(1, Math.min(maxLevel ?? 20, identity.level));
  const maxHp = selectedClass.hit_die + conMod;
  const baseAC = 10 + dexMod;
  const speed = RACE_SPEED[identity.race] ?? 30;
  const profBonus = proficiencyBonus(level);

  const setScore = (key, val) => {
    const n = Math.max(1, Math.min(30, Number(val) || 10));
    setScores((s) => ({ ...s, [key]: n }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const character = {
        name: identity.name.trim(),
        race: identity.race,
        class: identity.class_name,
        background: identity.background,
        alignment: identity.alignment,
        level,
        proficiency_bonus: profBonus,
        ability_scores: { ...activeScores },
        max_hp: Math.max(1, maxHp),
        current_hp: Math.max(1, maxHp),
        temp_hp: 0,
        armor_class: baseAC,
        speed,
        conditions: [],
        equipment: [],
        features: [],
        spell_slots: {},
        known_spells: [],
        backstory: identity.backstory,
        ...(hasRerolled && { rerolled: true }),
      };
      await api.saveCharacter(campaignId, character);
      navigate(`/campaigns/${campaignId}/lobby`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
    <div style={{
      position: 'fixed', inset: 0,
      overflowY: 'auto',
      backgroundImage: 'url(/tlw_character_select.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      }} />
      <h1 style={{ position: 'relative', textAlign: 'center', padding: '84px 24px 28px', margin: 0 }}>Create Character</h1>
    <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto', padding: '0 24px 24px' }}>

      {step === 1 && maxLevel === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      )}

      {step === 1 && maxLevel !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
          <ClassDiePicker onChange={(name) => setIdentity((i) => ({ ...i, class_name: name }))} />

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Identity</h3>

            <div>
              <label className="label" htmlFor="character_name">Character Name *</label>
              <input
                id="character_name"
                type="text"
                value={identity.name}
                onChange={(e) => setIdentity((i) => ({ ...i, name: e.target.value }))}
                placeholder="Aldric Stormraven..."
              />
            </div>

            <div>
              <label className="label">Race</label>
              <select value={identity.race} onChange={(e) => setIdentity((i) => ({ ...i, race: e.target.value }))}>
                {RACES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Background</label>
                <select value={identity.background} onChange={(e) => setIdentity((i) => ({ ...i, background: e.target.value }))}>
                  {BACKGROUNDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Alignment</label>
                <select value={identity.alignment} onChange={(e) => setIdentity((i) => ({ ...i, alignment: e.target.value }))}>
                  {ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="starting_level">Starting Level</label>
              <select
                id="starting_level"
                value={identity.level}
                onChange={(e) => setIdentity((i) => ({ ...i, level: Number(e.target.value) }))}
                style={{ width: 120 }}
              >
                {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>Level {n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Backstory (optional)</label>
              <textarea
                value={identity.backstory}
                onChange={(e) => setIdentity((i) => ({ ...i, backstory: e.target.value }))}
                placeholder="Where did your character come from? What drives them?"
                rows={4}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleNext}
            disabled={!identity.name.trim()}
          >
            Ability Scores →
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Ability Scores</h3>

            {isStandardArray ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Click a slot, then click a value to assign it. Click an assigned slot to return it to the pool.
                </p>

                {/* Chip pool */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {engine.availableChips.map((chip, i) => (
                    <button
                      key={`${chip}-${i}`}
                      onClick={() => {
                        if (selectedSlot) {
                          engine.assign(selectedSlot, chip);
                          setSelectedSlot(null);
                        }
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: `2px solid ${selectedSlot ? 'var(--gold)' : 'var(--border)'}`,
                        background: selectedSlot ? 'rgba(212,175,55,0.15)' : 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: 16,
                        cursor: selectedSlot ? 'pointer' : 'default',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                  {engine.availableChips.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>All values assigned</span>
                  )}
                </div>

                {/* Ability slots */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {ABILITY_KEYS.map((key) => {
                    const val = engine.scores[key];
                    const isSelected = selectedSlot === key;
                    const m = mod(val ?? 10);
                    return (
                      <button
                        key={key}
                        aria-pressed={isSelected}
                        onClick={() => {
                          if (val !== null) {
                            engine.unassign(key);
                            setSelectedSlot(null);
                          } else {
                            setSelectedSlot(isSelected ? null : key);
                          }
                        }}
                        style={{
                          textAlign: 'center',
                          padding: '10px 8px',
                          background: isSelected ? 'rgba(212,175,55,0.1)' : 'var(--card-bg)',
                          border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          {ABILITY_SHORT[key]}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: val !== null ? 'var(--text-primary)' : 'var(--text-muted)', minHeight: 27 }}>
                          {val !== null ? val : '—'}
                        </div>
                        <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                          {val !== null ? (m >= 0 ? `+${m}` : m) : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : isPointBuy ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Spend points to raise scores ({engine.minScore}–{engine.maxScore}).
                  </p>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: engine.pointsRemaining >= 0 ? 'var(--gold)' : 'var(--danger)' }}>
                      {engine.pointsRemaining}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts left</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {ABILITY_KEYS.map((key) => {
                    const displayScore = engine.scores[key] ?? engine.minScore;
                    const m = mod(displayScore);
                    const costIncrement = engine.pointBuyCostIncrement(displayScore);
                    const plusDisabled = displayScore >= engine.maxScore || engine.pointsRemaining < costIncrement;
                    const minusDisabled = displayScore <= engine.minScore;
                    return (
                      <div key={key} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          {ABILITY_SHORT[key]}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button
                            aria-label={`Decrease ${key}`}
                            onClick={() => engine.adjustScore(key, -1)}
                            disabled={minusDisabled}
                            style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: minusDisabled ? 'not-allowed' : 'pointer', opacity: minusDisabled ? 0.4 : 1, fontWeight: 700, fontSize: 16, lineHeight: 1 }}
                          >−</button>
                          <span style={{ fontSize: 18, fontWeight: 700, minWidth: 24 }}>{displayScore}</span>
                          <button
                            aria-label={`Increase ${key}`}
                            onClick={() => engine.adjustScore(key, 1)}
                            disabled={plusDisabled}
                            style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: plusDisabled ? 'not-allowed' : 'pointer', opacity: plusDisabled ? 0.4 : 1, fontWeight: 700, fontSize: 16, lineHeight: 1 }}
                          >+</button>
                        </div>
                        <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                          {m >= 0 ? `+${m}` : m}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : isRollForStats ? (
              <>
                {engine.rollResults.length < 6 ? (
                  /* ── Roll phase ── */
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Roll {rollDiceCount}d6, keep highest {rollKeepCount}. Roll each slot individually or all at once.
                    </p>
                    <button
                      className="btn btn-secondary btn-full"
                      onClick={doRollAll}
                      disabled={engine.rollResults.length > 0}
                    >
                      Roll All
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Array.from({ length: 6 }, (_, i) => {
                        const result = engine.rollResults[i];
                        const sortedDice = result ? [...result.rolls].sort((a, b) => b - a) : [];
                        return (
                          <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, flexShrink: 0 }}>#{i + 1}</span>
                            {result ? (
                              <>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {sortedDice.map((die, j) => (
                                    <span
                                      key={j}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 26, height: 26, borderRadius: 4,
                                        border: `1px solid ${j < rollKeepCount ? 'var(--gold)' : 'var(--border)'}`,
                                        color: j < rollKeepCount ? 'var(--gold)' : 'var(--text-muted)',
                                        textDecoration: j < rollKeepCount ? 'none' : 'line-through',
                                        fontSize: 13, fontWeight: 600,
                                      }}
                                    >
                                      {die}
                                    </span>
                                  ))}
                                </div>
                                <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>
                                  = {result.sum}
                                </span>
                              </>
                            ) : (
                              <button className="btn btn-sm btn-secondary" onClick={doRoll} style={{ marginLeft: 'auto' }}>
                                Roll
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* ── Assign phase — identical to Standard Array chip UI ── */
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      All scores rolled! Click a slot, then click a value to assign it.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {engine.availableChips.map((chip, i) => (
                        <div key={`${chip}-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => {
                              if (selectedSlot) {
                                engine.assign(selectedSlot, chip);
                                setSelectedSlot(null);
                              }
                            }}
                            style={{
                              padding: '6px 14px', borderRadius: 6,
                              border: `2px solid ${selectedSlot ? 'var(--gold)' : 'var(--border)'}`,
                              background: selectedSlot ? 'rgba(212,175,55,0.15)' : 'var(--card-bg)',
                              color: 'var(--text-primary)', fontWeight: 700, fontSize: 16,
                              cursor: selectedSlot ? 'pointer' : 'default',
                            }}
                          >
                            {chip}
                          </button>
                          {/* Reroll control under each chip */}
                          {iAmCreator ? (
                            confirmingChipIdx === i ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 10, padding: '2px 6px', background: 'var(--danger)', color: '#fff' }}
                                  onClick={() => {
                                    const result = rollDice({ sides: 6, count: rollDiceCount, keep: rollKeepCount });
                                    engine.rerollChip(chip, result);
                                    setHasRerolled(true);
                                    setConfirmingChipIdx(null);
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                  onClick={() => setConfirmingChipIdx(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm"
                                style={{ fontSize: 10, padding: '2px 6px' }}
                                onClick={() => setConfirmingChipIdx(i)}
                              >
                                Reroll
                              </button>
                            )
                          ) : (
                            reroll.status === 'pending' || reroll.status === 'denied' ? (
                              <button
                                className="btn btn-sm"
                                style={{ fontSize: 10, padding: '2px 6px' }}
                                disabled={reroll.status === 'pending'}
                                onClick={() => {
                                  if (reroll.status === 'denied') { reroll.clearDenied(); }
                                }}
                              >
                                {reroll.status === 'pending' ? 'Pending approval…' : 'Denied — request again'}
                              </button>
                            ) : confirmingChipIdx === i ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 10, padding: '2px 6px', background: 'var(--danger)', color: '#fff' }}
                                  onClick={() => {
                                    reroll.requestReroll(chip);
                                    setConfirmingChipIdx(null);
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                  onClick={() => setConfirmingChipIdx(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm"
                                style={{ fontSize: 10, padding: '2px 6px' }}
                                onClick={() => setConfirmingChipIdx(i)}
                              >
                                Request Reroll
                              </button>
                            )
                          )}
                        </div>
                      ))}
                      {engine.availableChips.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>All values assigned</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {ABILITY_KEYS.map((key) => {
                        const val = engine.scores[key];
                        const isSelected = selectedSlot === key;
                        const m = mod(val ?? 10);
                        return (
                          <button
                            key={key}
                            aria-pressed={isSelected}
                            onClick={() => {
                              if (val !== null) { engine.unassign(key); setSelectedSlot(null); }
                              else { setSelectedSlot(isSelected ? null : key); }
                            }}
                            style={{
                              textAlign: 'center', padding: '10px 8px',
                              background: isSelected ? 'rgba(212,175,55,0.1)' : 'var(--card-bg)',
                              border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                              borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'inherit',
                            }}
                          >
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                              {ABILITY_SHORT[key]}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: val !== null ? 'var(--text-primary)' : 'var(--text-muted)', minHeight: 27 }}>
                              {val !== null ? val : '—'}
                            </div>
                            <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                              {val !== null ? (m >= 0 ? `+${m}` : m) : ''}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Enter scores 1–30.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {ABILITY_KEYS.map((key) => {
                    const m = mod(scores[key]);
                    return (
                      <div key={key} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          {ABILITY_SHORT[key]}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={scores[key]}
                          onChange={(e) => setScore(key, e.target.value)}
                          style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                        />
                        <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                          {m >= 0 ? `+${m}` : m}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Derived stats preview */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px', color: 'var(--gold)' }}>Derived Stats</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                ['HP', Math.max(1, maxHp)],
                ['AC', baseAC],
                ['Speed', `${speed}ft`],
                ['Prof', `+${profBonus}`],
              ].map(([label, val]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              HP = {selectedClass.hit_die} (d{selectedClass.hit_die}) + {conMod} (CON modifier)
            </p>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '10px 14px', background: 'rgba(233,69,96,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-full"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              onClick={handleBack}
            >
              Back
            </button>
            <button
              className="btn btn-primary btn-full"
              onClick={handleSubmit}
              disabled={saving || (useEngine && !engine.isValid)}
              title={useEngine && !engine.isValid ? (engine.validationMessage || 'Complete ability scores to continue') : undefined}
            >
              {saving ? 'Saving character...' : 'Enter the Adventure →'}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>

    {/* Confirmation modal */}
    {confirmAction && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--danger)' }}>
            {confirmAction === 'cancel' ? 'Cancel Campaign?' : 'Leave Campaign?'}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            {confirmAction === 'cancel'
              ? 'This will permanently delete the campaign and remove all players. This cannot be undone.'
              : 'You will be removed from this campaign and taken back to the Dashboard.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmAction(null)}
              disabled={actioning}
            >
              Keep Playing
            </button>
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent' }}
              onClick={handleConfirmedAction}
              disabled={actioning}
            >
              {actioning ? 'Working...' : confirmAction === 'cancel' ? 'Yes, Cancel Campaign' : 'Yes, Leave Campaign'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
