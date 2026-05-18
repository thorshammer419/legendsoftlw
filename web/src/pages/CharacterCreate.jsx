import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ClassDiePicker from '../components/character/ClassDiePicker';
import { useSignalR } from '../hooks/useSignalR';
import { useNavbar } from '../context/NavbarContext';
import { useAbilityScoreEngine } from '../hooks/useAbilityScoreEngine';

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
  const { setCenterContent } = useNavbar();

  const [step, setStep] = useState(1); // 1 = identity, 2 = ability scores
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [maxLevel, setMaxLevel] = useState(null); // null = loading
  const [creatorEmails, setCreatorEmails] = useState([]);
  const [abilityScoreMethod, setAbilityScoreMethod] = useState('standard_array');
  const [abilityScoreRules, setAbilityScoreRules] = useState({ standard_array: [15, 14, 13, 12, 10, 8] });
  const [confirmAction, setConfirmAction] = useState(null); // 'leave' | 'cancel' | null
  const [actioning, setActioning] = useState(false);

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
  const activeScores = isStandardArray
    ? Object.fromEntries(ABILITY_KEYS.map((k) => [k, engine.scores[k] ?? 10]))
    : scores;

  useEffect(() => {
    api.getCampaign(campaignId)
      .then((c) => {
        const max = c.max_starting_level ?? 20;
        setMaxLevel(max);
        setCreatorEmails(c.creator_emails ?? []);
        setIdentity((i) => ({ ...i, level: max }));
        setAbilityScoreMethod(c.ability_score_method ?? 'standard_array');
        setAbilityScoreRules(c.ability_score_rules ?? { standard_array: [15, 14, 13, 12, 10, 8] });
      })
      .catch(() => setMaxLevel(20));
  }, [campaignId]);

  const myEmail = user?.userDetails;
  const iAmCreator = creatorEmails.includes(myEmail);

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

  useSignalR(campaignId, {
    onLobbyEvent: (event) => {
      if (event.type === 'campaign_deleted') {
        navigate('/', { replace: true });
      }
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
            onClick={() => setStep(2)}
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

          <button
            className="btn btn-primary btn-full"
            onClick={handleSubmit}
            disabled={saving || (isStandardArray && !engine.isComplete)}
            title={isStandardArray && !engine.isComplete ? 'Assign all ability scores to continue' : undefined}
          >
            {saving ? 'Saving character...' : 'Enter the Adventure →'}
          </button>
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
