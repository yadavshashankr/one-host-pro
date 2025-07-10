import React, { useState, useRef, useEffect } from 'react';
import {
  IconButton,
  TextField,
  Typography,
  CircularProgress,
  Avatar
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  InsertEmoticon as EmojiIcon
} from '@mui/icons-material';
import { Picker } from 'emoji-mart';
import useChatStore from '../store/chatStore';

const ChatWindow = ({ peer, onSendText, onSendFile }) => {
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  const { getConversation, addMessage } = useChatStore();
  const messages = getConversation(peer);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    
    try {
      const sentMessage = await onSendText(message.trim(), peer);
      addMessage(peer, {
        ...sentMessage,
        sender: 'me',
        status: 'sent'
      });
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileId = await onSendFile(file, peer);
      addMessage(peer, {
        id: fileId,
        type: 'file',
        name: file.name,
        size: file.size,
        sender: 'me',
        status: 'sending',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to send file:', error);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      // Notify peer that we're typing
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      // Notify peer we stopped typing
    }, 1000);
  };

  const addEmoji = (emoji) => {
    setMessage(prev => prev + emoji.native);
    setShowEmoji(false);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMessage = (message) => {
    const isMe = message.sender === 'me';
    const messageClass = isMe ? 'message-out' : 'message-in';

    return (
      <div
        key={message.id}
        className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-4`}
      >
        {!isMe && (
          <Avatar className="mr-2">
            {peer.slice(0, 2).toUpperCase()}
          </Avatar>
        )}
        <div className={`message-bubble ${messageClass}`}>
          {message.type === 'file' ? (
            <div className="flex items-center">
              <AttachFileIcon className="mr-2" />
              <div>
                <Typography variant="body2">{message.name}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {(message.size / 1024).toFixed(1)} KB
                </Typography>
              </div>
              {message.status === 'sending' && (
                <CircularProgress size={16} className="ml-2" />
              )}
            </div>
          ) : (
            <Typography>{message.text}</Typography>
          )}
          <div className="flex items-center justify-end">
            <Typography variant="caption" className="message-time">
              {formatTime(message.timestamp)}
            </Typography>
            {isMe && (
              <span className="message-status">
                {message.status === 'read' ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-whatsapp-chat-bg">
      {/* Chat Header */}
      <div className="bg-whatsapp-green text-white p-4 flex items-center">
        <Avatar className="mr-3">{peer.slice(0, 2).toUpperCase()}</Avatar>
        <Typography variant="h6">{peer}</Typography>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {showEmoji && (
        <div className="absolute bottom-16 left-4">
          <Picker onSelect={addEmoji} theme="light" />
        </div>
      )}

      {/* Input Area */}
      <div className="bg-white p-3 flex items-center">
        <IconButton onClick={() => setShowEmoji(!showEmoji)}>
          <EmojiIcon />
        </IconButton>
        <IconButton onClick={() => fileInputRef.current?.click()}>
          <AttachFileIcon />
        </IconButton>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
        <TextField
          className="chat-input mx-2"
          placeholder="Type a message"
          multiline
          maxRows={4}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          onKeyPress={handleKeyPress}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!message.trim()}
        >
          <SendIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default ChatWindow; 