import { useState } from 'react';

export default function MessageInput({ onSubmit }) {
  const [content, setContent] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    await onSubmit(trimmed);
    setContent('');
  }

  return (
    <form className="message-form" onSubmit={handleSubmit}>
      <input
        aria-label="Message"
        placeholder="?crire un message..."
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <button type="submit">Envoyer</button>
    </form>
  );
}
