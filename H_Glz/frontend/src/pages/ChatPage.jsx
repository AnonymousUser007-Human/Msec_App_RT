import { useEffect, useMemo, useState } from 'react';

import ConnectionStatus from '../components/ConnectionStatus.jsx';
import MessageInput from '../components/MessageInput.jsx';
import MessageList from '../components/MessageList.jsx';
import { fetchMessages, sendMessage } from '../services/api.js';
import { createChatSocket } from '../socket/chatSocket.js';

export default function ChatPage() {
  const [author, setAuthor] = useState('Invit?');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting');

  const socket = useMemo(
    () =>
      createChatSocket({
        onOpen: () => setStatus('connected'),
        onClose: () => setStatus('disconnected'),
        onMessage: (message) => {
          setMessages((current) => {
            if (current.some((item) => item.id === message.id)) {
              return current;
            }

            return [...current, message];
          });
        },
      }),
    [],
  );

  useEffect(() => {
    fetchMessages()
      .then(setMessages)
      .catch(() => setStatus('disconnected'));

    socket.connect();
    return () => socket.disconnect();
  }, [socket]);

  async function handleSubmit(content) {
    const payload = { author, content };

    if (socket.isConnected()) {
      socket.send(payload);
      return;
    }

    const message = await sendMessage(payload);
    setMessages((current) => [...current, message]);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">TraceChat</p>
            <h1>Messagerie temps r?el</h1>
          </div>
          <ConnectionStatus status={status} />
        </header>

        <label className="author-field">
          Votre nom
          <input value={author} onChange={(event) => setAuthor(event.target.value)} />
        </label>

        <MessageList messages={messages} />
        <MessageInput onSubmit={handleSubmit} />
      </section>
    </main>
  );
}
