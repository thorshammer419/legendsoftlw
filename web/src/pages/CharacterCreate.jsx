import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import ClassDiePicker from '../components/character/ClassDiePicker';
import AbilityScorePanel from '../components/character/AbilityScorePanel';
import { useSignalR } from '../hooks/useSignalR';
import { useNavbar } from '../context/NavbarContext';
import { useAbilityScoreEngine } from '../hooks/useAbilityScoreEngine';
import { useRerollApproval } from '../hooks/useRerollApproval';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { rollDice } from '../utils/diceRoller';
import { ABILITY_KEYS, mod } from '../data/abilityScoreConstants';

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

const INITIAL_SCORES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

function proficiencyBonus(level) {
  return Math.floor((level - 1) / 4) + 2;
}


export default function CharacterCreate({ user }) {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCenterContent, setBackOverride, setPendingRerollRequest } = useNavbar();

  const startedAtStep2 = searchParams.get('step') === '2';
  const [step, setStep] = useState(() => startedAtStep2 ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [maxLevel, setMaxLevel] = useState(null);
  const [creatorEmails, setCreatorEmails] = useState([]);
  const [abilityScoreMethod, setAbilityScoreMethod] = useState('standard_array');
  const [abilityScoreRules, setAbilityScoreRules] = useState({ standard_array: [15, 14, 13, 12, 10, 8] });
  const [confirmAction, setConfirmAction] = useState(null);
  const [actioning, setActioning] = useState(false);
  const [hasRerolled, setHasRerolled] = useState(false);
  const [campaignLoaded, setCampaignLoaded] = useState(false);

  // Manual fallback scores — only used when no ability_score_method is set
  const [scores, setScores] = useState(INITIAL_SCORES);

  const [identity, setIdentity] = useState({
    name: '',
    race: RACES[0],
    class_name: CLASSES[0].name,
    background: BACKGROUNDS[0],
    alignment: 'True Neutral',
    level: 1,
    backstory: '',
  });

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

  // Campaign data — maxLevel, creator role, ability score rules
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

  const myEmail = user?.userDetails;
  const iAmCreator = creatorEmails.includes(myEmail);

  // Draft persistence — load on mount, save on navigation, save on unload
  const draftRef = useRef(null);
  draftRef.current = {
    step,
    identity,
    scores: engine.scores,
    available_chips: engine.availableChips,
    roll_results: engine.rollResults,
  };

  const { draftRestored, saveDraft, markSkipSave } = useDraftPersistence({
    campaignId,
    campaignLoaded,
    abilityScoreMethod,
    getDraftData: () => draftRef.current,
    onRestored: ({ identity: restoredIdentity, step: restoredStep, scores: restoredScores, availableChips, rollResults }) => {
      if (restoredIdentity) setIdentity(restoredIdentity);
      if (restoredStep === 2) setStep(2);
      engine.restoreFromDraft({ scores: restoredScores, availableChips, rollResults });
    },
    initialDraftRestored: !startedAtStep2,
  });

  const handleNext = async () => {
    await saveDraft({ step: 2 });
    setStep(2);
  };

  const handleBack = async () => {
    await saveDraft({ step: 1 });
    setStep(1);
  };

  // Navbar — back override and center content (step indicator + Cancel/Leave)
  useEffect(() => {
    if (step !== 2) {
      setBackOverride(iAmCreator ? '/campaigns/new' : '/');
      return () => setBackOverride(null);
    }
    setBackOverride(() => handleBack);
    return () => setBackOverride(null);
  }, [step, iAmCreator]); // eslint-disable-line react-hooks/exhaustive-deps

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
      markSkipSave();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Action failed:', err);
      setActioning(false);
      setConfirmAction(null);
    }
  };

  // Derived stats
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
      await saveDraft({ step: 2 });
      markSkipSave();
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
          <ClassDiePicker value={identity.class_name} onChange={(name) => setIdentity((i) => ({ ...i, class_name: name }))} />

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

      {step === 2 && !draftRestored && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      )}

      {step === 2 && draftRestored && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AbilityScorePanel
            method={abilityScoreMethod}
            engine={engine}
            reroll={reroll}
            iAmCreator={iAmCreator}
            rollDiceCount={rollDiceCount}
            rollKeepCount={rollKeepCount}
            onRerolled={() => setHasRerolled(true)}
            manualScores={scores}
            onManualScoreChange={setScore}
          />

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
