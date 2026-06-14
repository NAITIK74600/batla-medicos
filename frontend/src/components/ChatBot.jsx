import { useState, useRef, useEffect } from 'react';
import { X, MessageCircle, Send, Bot, ChevronDown, Sparkles } from 'lucide-react';
import api from '../api/axios';

const WELCOME = "Namaste! 👋 I'm MedBot, your Batla Medicos assistant.\n\nAsk me about medicines, health tips, lab tests, or anything about our store!";

const QUICK_REPLIES = [
  'Store timings & location',
  'Home delivery available?',
  'How to book a lab test?',
  'Payment options',
  'How to order online?',
  'What medicines do you sell?',
];

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    const newMessages = [...messages, { role: 'user', text: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Build history: skip the initial welcome message from history
      const history = newMessages.slice(1, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const { data } = await api.post('/chat', { message: msg, history });
      setMessages(prev => [...prev, { role: 'bot', text: data.reply }]);
      if (!open) setUnread(u => u + 1);
    } catch (err) {
      // Show the server's error message if available, otherwise generic fallback
      const serverMsg = err?.response?.data?.message;
      setMessages(prev => [...prev, {
        role: 'bot',
        text: serverMsg || 'Sorry, I ran into an issue. Please try again in a moment.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        className={`chatbot-fab ${open ? 'chatbot-fab--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close chat' : 'Open MedBot chat assistant'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <span className="chatbot-fab__ring" />}
        {!open && unread > 0 && (
          <span className="chatbot-fab__badge">{unread}</span>
        )}
      </button>

      {/* Chat panel */}
      <div className={`chatbot-window ${open ? 'chatbot-window--visible' : ''}`} aria-hidden={!open}>
        {/* Header */}
        <div className="chatbot-header">
          <div className="chatbot-header__avatar">
            <Bot size={16} />
          </div>
          <div className="chatbot-header__info">
            <span className="chatbot-header__name">
              MedBot <Sparkles size={12} className="chatbot-header__spark" />
            </span>
            <span className="chatbot-header__status">
              <span className="chatbot-header__dot" /> Batla Medicos Assistant
            </span>
          </div>
          <button className="chatbot-header__close" onClick={() => setOpen(false)} aria-label="Minimize">
            <ChevronDown size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="chatbot-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chatbot-msg chatbot-msg--${m.role}`}>
              {m.role === 'bot' && (
                <div className="chatbot-msg__avatar"><Bot size={13} /></div>
              )}
              <div className="chatbot-msg__bubble">
                {m.text.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < m.text.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="chatbot-msg chatbot-msg--bot">
              <div className="chatbot-msg__avatar"><Bot size={13} /></div>
              <div className="chatbot-msg__bubble chatbot-msg__bubble--typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          {/* Quick replies — only show after welcome message */}
          {messages.length === 1 && !loading && (
            <div className="chatbot-quick-replies">
              {QUICK_REPLIES.map((q, i) => (
                <button key={i} className="chatbot-quick-reply" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="chatbot-input">
          <textarea
            ref={inputRef}
            className="chatbot-input__field"
            placeholder="Ask me anything about medicines..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            maxLength={500}
            disabled={loading}
          />
          <button
            className="chatbot-input__send"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
