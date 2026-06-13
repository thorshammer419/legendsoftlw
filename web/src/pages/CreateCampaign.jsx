import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useNavbar } from '../context/NavbarContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Helsinki',
  'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney',
];

const ABILITY_SCORE_METHODS = [
  { value: 'standard_array', label: 'Standard Array', description: 'Assign the fixed values 15, 14, 13, 12, 10, 8' },
  { value: 'point_buy', label: 'Point Buy', description: 'Spend 27 points; scores range 8–15' },
  { value: 'roll_for_stats', label: 'Roll for Stats', description: 'Roll 4d6 drop lowest for each score' },
];

const STORAGE_KEY = 'campaign_draft';
const CAMPAIGN_ID_KEY = 'campaign_draft_id';
const RULES_LOCKED_KEY = 'campaign_rules_locked';

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const DEFAULTS = {
  name: '',
  party_name: '',
  description: '',
  password: '',
  max_players: 8,
  max_starting_level: 1,
  ability_score_method: 'standard_array',
  ability_score_rules: {
    standard_array: [15, 14, 13, 12, 10, 8],
    point_buy_points: 27,
    point_buy_min: 8,
    point_buy_max: 15,
    roll_dice: 4,
    roll_keep: 3,
  },
  schedule: {
    timezone: 'America/Chicago',
    active_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    timeout_enabled: true,
    round_timeout_minutes: 1440,
    blackout_dates: [],
  },
};

const SUBSETTING_STYLE = {
  marginTop: 8,
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

function StandardArraySettings({ rules, setRules, disabled }) {
  const arr = rules.standard_array;
  return (
    <div style={SUBSETTING_STYLE}>
      <label className="label" style={{ margin: 0 }}>Array Values</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {arr.map((val, i) => (
          <input
            key={i}
            type="number"
            min={1}
            max={20}
            value={val}
            onChange={(e) => {
              const next = [...arr];
              next[i] = Math.min(20, Math.max(1, Number(e.target.value) || 1));
              setRules('standard_array', next);
            }}
            disabled={disabled}
            style={{ width: 48, textAlign: 'center', opacity: disabled ? 0.5 : 1 }}
            aria-label={`Array value ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function PointBuySettings({ rules, setRules, disabled }) {
  const minScore = rules.point_buy_min ?? 8;
  const maxScore = rules.point_buy_max ?? 15;
  return (
    <div style={SUBSETTING_STYLE}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label className="label" style={{ margin: '0 0 4px' }}>Point Budget</label>
          <input
            type="number"
            min={1}
            max={72}
            value={rules.point_buy_points}
            onChange={(e) => setRules('point_buy_points', Math.min(72, Math.max(1, Number(e.target.value) || 1)))}
            disabled={disabled}
            style={{ width: 72, opacity: disabled ? 0.5 : 1 }}
            aria-label="Point buy budget"
          />
        </div>
        <div>
          <label className="label" style={{ margin: '0 0 4px' }}>Min Score</label>
          <input
            type="number"
            min={1}
            max={maxScore - 1}
            value={minScore}
            onChange={(e) => {
              const val = Math.min(maxScore - 1, Math.max(1, Number(e.target.value) || 1));
              setRules('point_buy_min', val);
            }}
            disabled={disabled}
            style={{ width: 60, opacity: disabled ? 0.5 : 1 }}
            aria-label="Point buy minimum score"
          />
        </div>
        <div>
          <label className="label" style={{ margin: '0 0 4px' }}>Max Score</label>
          <input
            type="number"
            min={minScore + 1}
            max={20}
            value={maxScore}
            onChange={(e) => {
              const val = Math.min(20, Math.max(minScore + 1, Number(e.target.value) || (minScore + 1)));
              setRules('point_buy_max', val);
            }}
            disabled={disabled}
            style={{ width: 60, opacity: disabled ? 0.5 : 1 }}
            aria-label="Point buy maximum score"
          />
        </div>
      </div>
    </div>
  );
}

function RollSettings({ rules, setRules, disabled }) {
  const [keepMsg, setKeepMsg] = useState(false);
  const timerRef = useRef(null);

  const setDice = (val) => {
    const dice = Math.max(1, Number(val) || 1);
    setRules('roll_dice', dice);
    if (rules.roll_keep > dice) {
      setRules('roll_keep', dice);
      clearTimeout(timerRef.current);
      setKeepMsg(true);
      timerRef.current = setTimeout(() => setKeepMsg(false), 3000);
    }
  };

  const setKeep = (val) => {
    const keep = Math.max(1, Number(val) || 1);
    if (keep > rules.roll_dice) {
      setRules('roll_keep', rules.roll_dice);
      clearTimeout(timerRef.current);
      setKeepMsg(true);
      timerRef.current = setTimeout(() => setKeepMsg(false), 3000);
    } else {
      setRules('roll_keep', keep);
    }
  };

  return (
    <div style={SUBSETTING_STYLE}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <label className="label" style={{ margin: '0 0 4px' }}>Dice to Roll</label>
          <input
            type="number"
            min={1}
            value={rules.roll_dice}
            onChange={(e) => setDice(e.target.value)}
            disabled={disabled}
            style={{ width: 64, opacity: disabled ? 0.5 : 1 }}
            aria-label="Dice to roll"
          />
        </div>
        <div>
          <label className="label" style={{ margin: '0 0 4px' }}>Dice to Keep</label>
          <input
            type="number"
            min={1}
            value={rules.roll_keep}
            onChange={(e) => setKeep(e.target.value)}
            disabled={disabled}
            style={{ width: 64, opacity: disabled ? 0.5 : 1 }}
            aria-label="Dice to keep"
          />
          {keepMsg && (
            <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0' }}>
              Keep cannot exceed dice total
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GenerateButton({ field, generating, onGenerate }) {
  const isActive = generating === field;
  const isDisabled = generating !== null;
  return (
    <button
      type="button"
      onClick={() => onGenerate(field)}
      disabled={isDisabled}
      aria-label={`Generate ${field.replace('_', ' ')} with AI`}
      style={{
        background: 'none',
        border: 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        padding: '2px 4px',
        opacity: isDisabled && !isActive ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {isActive ? (
        <span style={{ fontSize: 13, color: 'var(--gold)' }}>...</span>
      ) : (
        <img src="/tlw_d20_roll.png" alt="" width={20} height={20} style={{ display: 'block' }} />
      )}
    </button>
  );
}

export default function CreateCampaign() {
  const navigate = useNavigate();
  const { setCenterContent, setBackOverride } = useNavbar();
  const [form, setForm] = useState(() => {
    const draft = loadDraft();
    if (!draft) return DEFAULTS;
    return {
      ...DEFAULTS,
      ...draft,
      schedule: { ...DEFAULTS.schedule, ...(draft.schedule || {}) },
      ability_score_rules: { ...DEFAULTS.ability_score_rules, ...(draft.ability_score_rules || {}) },
    };
  });
  const [existingCampaignId] = useState(() => {
    try { return sessionStorage.getItem(CAMPAIGN_ID_KEY) || null; } catch { return null; }
  });
  const [rulesLocked] = useState(() => {
    try {
      return sessionStorage.getItem(RULES_LOCKED_KEY) === 'true'
          && !!sessionStorage.getItem(CAMPAIGN_ID_KEY);
    } catch { return false; }
  });
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmProceed, setConfirmProceed] = useState(false);

  useEffect(() => {
    setCenterContent(
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Step 1 of 3</span>
    );
    return () => setCenterContent(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (existingCampaignId) {
      setBackOverride(() => () => setConfirmCancel(true));
    } else {
      setBackOverride('/');
    }
    return () => setBackOverride(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch {}
  }, [form]);

  const handleCancelCampaign = async () => {
    setCancelling(true);
    try {
      await api.deleteCampaign(existingCampaignId);
      try { sessionStorage.removeItem(CAMPAIGN_ID_KEY); } catch {}
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { sessionStorage.removeItem(RULES_LOCKED_KEY); } catch {}
      navigate('/');
    } catch (err) {
      console.error('Cancel failed:', err);
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const setSchedule = (key, value) =>
    setForm((f) => ({ ...f, schedule: { ...f.schedule, [key]: value } }));

  const setRules = (key, value) =>
    setForm((f) => ({ ...f, ability_score_rules: { ...f.ability_score_rules, [key]: value } }));

  const handleGenerate = async (field) => {
    setGenerating(field);
    try {
      const context = {};
      if (form.name.trim()) context.name = form.name.trim();
      if (form.description.trim()) context.description = form.description.trim();
      const { value } = await api.generateCampaignField(field, context);
      setForm((f) => ({ ...f, [field]: value }));
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(null);
    }
  };

  const toggleDay = (day) => {
    const days = form.schedule.active_days;
    setSchedule('active_days', days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const campaign = await api.createCampaign(form);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch {}
      try { sessionStorage.removeItem(RULES_LOCKED_KEY); } catch {}
      try { sessionStorage.setItem(CAMPAIGN_ID_KEY, campaign.campaign_id); } catch {}
      navigate(`/campaigns/${campaign.campaign_id}/character`);
    } catch (err) {
      console.error('Create campaign failed:', err);
      setError(err.message || 'Failed to create campaign. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <h1 style={{ textAlign: 'center', padding: '84px 24px 28px', margin: 0 }}>New Campaign</h1>
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 24px 24px' }}>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, padding: '10px 14px', marginBottom: 8, background: 'rgba(233,69,96,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Basics */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Campaign Details</h3>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" htmlFor="name" style={{ margin: 0 }}>Campaign Name *</label>
              <GenerateButton field="name" generating={generating} onGenerate={handleGenerate} />
            </div>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="The Dark Descent..."
              required
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" htmlFor="party_name" style={{ margin: 0 }}>Party Name</label>
              <GenerateButton field="party_name" generating={generating} onGenerate={handleGenerate} />
            </div>
            <input
              id="party_name"
              type="text"
              value={form.party_name}
              onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
              placeholder="The Lord's Wrath..."
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" htmlFor="desc" style={{ margin: 0 }}>Description</label>
              <GenerateButton field="description" generating={generating} onGenerate={handleGenerate} />
            </div>
            <textarea
              id="desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="A brief synopsis of the adventure..."
              rows={3}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — leave blank for open access)</span></label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Leave blank for open campaign"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label" htmlFor="max_players">Max Players</label>
            <select
              id="max_players"
              value={form.max_players}
              onChange={(e) => setForm((f) => ({ ...f, max_players: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="max_starting_level">Max Starting Level</label>
            <select
              id="max_starting_level"
              value={form.max_starting_level}
              onChange={(e) => setForm((f) => ({ ...f, max_starting_level: Number(e.target.value) }))}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Level {n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Character Rules */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Character Rules
            {rulesLocked && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                locked
              </span>
            )}
          </h3>
          <div>
            <label className="label">Ability Score Method</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {ABILITY_SCORE_METHODS.map((method) => {
                const isSelected = form.ability_score_method === method.value;
                return (
                  <div key={method.value}>
                    <button
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => !rulesLocked && setForm((f) => ({ ...f, ability_score_method: method.value }))}
                      disabled={rulesLocked && !isSelected}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        height: 'auto', padding: '10px 14px', textAlign: 'left', width: '100%',
                        ...(rulesLocked && isSelected ? { border: '2px solid var(--gold)', boxShadow: '0 0 0 1px var(--gold)' } : {}),
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{method.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>{method.description}</span>
                    </button>

                    {form.ability_score_method === 'standard_array' && method.value === 'standard_array' && (
                      <StandardArraySettings rules={form.ability_score_rules} setRules={setRules} disabled={rulesLocked} />
                    )}
                    {form.ability_score_method === 'point_buy' && method.value === 'point_buy' && (
                      <PointBuySettings rules={form.ability_score_rules} setRules={setRules} disabled={rulesLocked} />
                    )}
                    {form.ability_score_method === 'roll_for_stats' && method.value === 'roll_for_stats' && (
                      <RollSettings rules={form.ability_score_rules} setRules={setRules} disabled={rulesLocked} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Round Schedule</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Controls when the AI DM will auto-resolve rounds if players haven't all submitted.
          </p>

          <div>
            <label className="label" htmlFor="tz">Timezone</label>
            <select
              id="tz"
              value={form.schedule.timezone}
              onChange={(e) => setSchedule('timezone', e.target.value)}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Active Days</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`btn btn-sm ${form.schedule.active_days.includes(day) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleDay(day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" htmlFor="quiet_start">Quiet Hours Start</label>
              <input
                id="quiet_start"
                type="time"
                value={form.schedule.quiet_hours_start}
                onChange={(e) => setSchedule('quiet_hours_start', e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="quiet_end">Quiet Hours End</label>
              <input
                id="quiet_end"
                type="time"
                value={form.schedule.quiet_hours_end}
                onChange={(e) => setSchedule('quiet_hours_end', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              id="timeout_enabled"
              type="checkbox"
              checked={form.schedule.timeout_enabled}
              onChange={(e) => setSchedule('timeout_enabled', e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="timeout_enabled" style={{ fontSize: 14, cursor: 'pointer' }}>
              Auto-resolve rounds after timeout
            </label>
          </div>

          {form.schedule.timeout_enabled && (
            <div>
              <label className="label" htmlFor="timeout_min">Round Timeout</label>
              <select
                id="timeout_min"
                value={form.schedule.round_timeout_minutes}
                onChange={(e) => setSchedule('round_timeout_minutes', Number(e.target.value))}
              >
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
                <option value={480}>8 hours</option>
                <option value={720}>12 hours</option>
                <option value={1440}>24 hours</option>
                <option value={2880}>48 hours</option>
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-full"
          disabled={saving || (!existingCampaignId && !form.name.trim())}
          onClick={() => {
            if (existingCampaignId) {
              rulesLocked ? navigate(`/campaigns/${existingCampaignId}/character`) : setConfirmProceed(true);
            } else {
              handleSubmit();
            }
          }}
        >
          {saving ? 'Creating...' : 'Continue to Character Create →'}
        </button>
      </form>
    </div>
    </div>

    {/* Lock-rules confirmation */}
    {confirmProceed && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Ability Score Rules Will Be Locked</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            Once you proceed to character creation, the ability score rules for this campaign cannot be changed.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmProceed(false)}>
              Stay Here
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => {
              try { sessionStorage.setItem(RULES_LOCKED_KEY, 'true'); } catch {}
              navigate(`/campaigns/${existingCampaignId}/character`);
            }}>
              Proceed to Character Create →
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Cancel campaign confirmation */}
    {confirmCancel && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--danger)' }}>Cancel Campaign?</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            This will permanently delete the campaign and remove all players. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
              Keep Campaign
            </button>
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent' }}
              onClick={handleCancelCampaign}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Yes, Cancel Campaign'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
