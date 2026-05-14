const labels = {
  connected: 'Connect?',
  connecting: 'Connexion...',
  disconnected: 'D?connect?',
};

export default function ConnectionStatus({ status }) {
  return <span className={`status status-${status}`}>{labels[status] ?? labels.disconnected}</span>;
}
