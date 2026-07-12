import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import JobBoard from "./pages/JobBoard";
import SignIn from "./pages/SignIn";
import Profile from "./pages/Profile";
import { AuthProvider, RequireAuth, useAuth } from "./lib/auth";

function Home() {
  const { session } = useAuth();
  return (
    <div className="wrap">
      <h1>Flightpath</h1>
      <p className="muted">From checkride to the flight deck. This is the dev scaffold — see the full UX in <code>public/prototype.html</code>.</p>
      <p>
        <Link className="btn" to="/jobs">Open the job board →</Link>{" "}
        {!session && <Link className="btn btn-ghost" to="/signin">Sign in</Link>}
      </p>
    </div>
  );
}

function Nav() {
  const { session } = useAuth();
  return (
    <nav className="nav">
      <Link to="/" className="brand">◈ Flightpath</Link>
      <div>
        <Link to="/jobs">Job board</Link>
        {session
          ? <Link to="/profile">My profile</Link>
          : <Link to="/signin">Sign in</Link>}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jobs" element={<JobBoard />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
