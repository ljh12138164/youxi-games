import manifest from '../game.json';

export function App() {
  return (
    <main className="game-placeholder">
      <h1>{manifest.title}</h1>
      <p>{manifest.description}</p>
    </main>
  );
}
