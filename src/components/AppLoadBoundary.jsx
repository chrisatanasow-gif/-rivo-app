import React, { Component, Suspense } from "react";
import { Button, Logo } from "./UI.jsx";
import "./AppLoadBoundary.css";

function LoadingScreen({ failed = false }) {
  return <div className="shell"><div className="app"><main className="appLoadScreen">
    <Logo/>
    {failed ? <div role="alert"><h1>Не успяхме да заредим екрана</h1><p>Провери връзката си и опитай отново.</p><Button onClick={() => window.location.reload()}>ОПИТАЙ ОТНОВО</Button></div>
      : <p role="status" aria-live="polite">Зареждаме RIVO…</p>}
  </main></div></div>;
}

export default class AppLoadBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <LoadingScreen failed/>;
    return <Suspense fallback={<LoadingScreen/>}>{this.props.children}</Suspense>;
  }
}
