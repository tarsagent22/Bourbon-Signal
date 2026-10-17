import React from 'react';
import { createRoot } from 'react-dom/client';
import Layout from '../../app/(app)/_layout';
import { NavigationRoot } from './navigation';
class Boundary extends React.Component<any, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { (window as any).navigationError = error.message; return { error: error.message }; }
  render() { return this.state.error ? <div role="alert">{this.state.error}</div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<Boundary><NavigationRoot><Layout /></NavigationRoot></Boundary>);
