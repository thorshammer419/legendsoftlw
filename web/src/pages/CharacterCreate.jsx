import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ClassDiePicker from '../components/character/ClassDiePicker';

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

  const [step, setStep] = useState(1); // 1 = identity, 2 = ability scores
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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

  const selectedClass = CLASSES.find((c) => c.name === identity.class_name) || CLASSES[0];
  const conMod = mod(scores.constitution);
  const dexMod = mod(scores.dexterity);
  const level = Math.max(1, Math.min(20, identity.level));
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
        ability_scores: { ...scores },
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
    <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto', padding: '48px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        {step === 2 ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← Back</button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
        )}
        <h1 style={{ margin: 0 }}>Create Character</h1>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Step {step} of 2</span>
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
          <ClassDiePicker onChange={(name) => setIdentity((i) => ({ ...i, class_name: name }))} />

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <h3 style={{ margin: 0, color: 'var(--gold)' }}>Identity</h3>

            <div>
              <label className="label">Character Name *</label>
              <input
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
              <label className="label">Starting Level</label>
              <input
                type="number"
                min={1}
                max={20}
                value={identity.level}
                onChange={(e) => setIdentity((i) => ({ ...i, level: Number(e.target.value) }))}
                style={{ width: 100 }}
              />
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
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Standard array (15, 14, 13, 12, 10, 8) or point buy. Enter scores 1–30.
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
            disabled={saving}
          >
            {saving ? 'Saving character...' : 'Enter the Adventure →'}
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
