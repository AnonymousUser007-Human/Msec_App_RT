export default function MessageList({ messages }) {
  if (messages.length === 0) {
    return <p className="empty-state">Aucun message pour le moment.</p>;
  }

  return (
    <ul className="message-list">
      {messages.map((message) => (
        <li className="message" key={message.id}>
          <div className="message-meta">
            <strong>{message.author}</strong>
            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString()}</time>
          </div>
          <p>{message.content}</p>
        </li>
      ))}
    </ul>
  );
}
