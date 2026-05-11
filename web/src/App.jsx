import { BrowserRouter, Routes, Route } from 'react-router-dom';

// TODO: implement pages
function Placeholder({ name }) {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{name} — coming soon</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Placeholder name="Login" />} />
        <Route path="/dashboard" element={<Placeholder name="Dashboard" />} />
        <Route path="/campaign/new" element={<Placeholder name="Create Campaign" />} />
        <Route path="/campaign/:id/character" element={<Placeholder name="Character Creation" />} />
        <Route path="/campaign/:id/game" element={<Placeholder name="Game" />} />
        <Route path="/campaign/:id/admin" element={<Placeholder name="Admin" />} />
        <Route path="/campaign/:id/archive" element={<Placeholder name="Archive" />} />
        <Route path="*" element={<Placeholder name="404" />} />
      </Routes>
    </BrowserRouter>
  );
}
