import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

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
  { value: 'roll', label: 'Roll for Stats', description: 'Roll 4d6 drop lowest for each score' },
];

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

function StandardArraySettings({ rules, setRules }) {
  const arr = rules.standard_array;
  return (
    <div style={SUBSETTING_STYLE}>
      <label className="label" style={{ margin: 0 }}>Array Values</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {arr.map((val, i) => {
          const outOfRange = val < 3 || val > 18;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <input
                type="number"
                value={val}
                onChange={(e) => {
                  const next = [...arr];
                  next[i] = Number(e.target.value) || 0;
                  setRules('standard_array', next);
                }}
                style={{ width: 48, textAlign: 'center' }}
                aria-label={`Array value ${i + 1}`}
              />
              {outOfRange && (
                <span style={{ fontSize: 10, color: 'var(--danger)' }}>3–18</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PointBuySettings({ rules, setRules }) {
  return (
    <div style={SUBSETTING_STYLE}>
      <label className="label" style={{ margin: 0 }}>Point Budget</label>
      <input
        type="number"
        min={1}
        max={72}
        value={rules.point_buy_points}
        onChange={(e) => setRules('point_buy_points', Math.min(72, Math.max(1, Number(e.target.value) || 1)))}
        style={{ width: 80 }}
        aria-label="Point buy budget"
      />
    </div>
  );
}

function RollSettings({ rules, setRules }) {
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
            style={{ width: 64 }}
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
            style={{ width: 64 }}
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
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(null);

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
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const campaign = await api.createCampaign(form);
      navigate(`/campaigns/${campaign.campaign_id}/character`);
    } catch (err) {
      console.error('Create campaign failed:', err);
      setError(err.message || 'Failed to create campaign. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back</button>
        <h1 style={{ margin: 0 }}>New Campaign</h1>
      </div>

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
          <h3 style={{ margin: 0, color: 'var(--gold)' }}>Character Rules</h3>
          <div>
            <label className="label">Ability Score Method</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {ABILITY_SCORE_METHODS.map((method) => (
                <div key={method.value}>
                  <button
                    type="button"
                    className={`btn btn-sm ${form.ability_score_method === method.value ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setForm((f) => ({ ...f, ability_score_method: method.value }))}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '10px 14px', textAlign: 'left', width: '100%' }}
                  >
                    <span style={{ fontWeight: 600 }}>{method.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>{method.description}</span>
                  </button>

                  {form.ability_score_method === 'standard_array' && method.value === 'standard_array' && (
                    <StandardArraySettings rules={form.ability_score_rules} setRules={setRules} />
                  )}
                  {form.ability_score_method === 'point_buy' && method.value === 'point_buy' && (
                    <PointBuySettings rules={form.ability_score_rules} setRules={setRules} />
                  )}
                  {form.ability_score_method === 'roll' && method.value === 'roll' && (
                    <RollSettings rules={form.ability_score_rules} setRules={setRules} />
                  )}
                </div>
              ))}
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

        <button type="submit" className="btn btn-primary btn-full" disabled={saving || !form.name.trim()}>
          {saving ? 'Creating...' : 'Create Campaign →'}
        </button>
      </form>
    </div>
    </div>
  );
}
