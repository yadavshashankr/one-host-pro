import { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';

const CHUNK_SIZE = 16384; // 16KB chunks
const MESSAGE_TYPES = {
  TEXT_MSG: 'text-message',
  IMAGE_MSG: 'image-message',
  FILE_MSG: 'file-message',
  ACK: 'ack',
  READ: 'read',
  TYPING: 'typing',
  PING: 'ping',
  PONG: 'pong'
};

export const usePeer = () => {
  const [peerId, setPeerId] = useState(null);
  const [peers, setPeers] = useState(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const peerRef = useRef(null);
  const connectionsRef = useRef(new Map());
  const keepAliveIntervalRef = useRef(null);

  useEffect(() => {
    // Initialize peer with stored ID or generate new one
    const storedId = localStorage.getItem('peerId') || uuidv4();
    
    const peer = new Peer(storedId, {
      host: 'localhost',
      port: 9000,
      path: '/myapp'
    });

    peer.on('open', (id) => {
      console.log('My peer ID is:', id);
      setPeerId(id);
      localStorage.setItem('peerId', id);
      setIsConnected(true);
      startKeepAlive();
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setError(err.message);
      setIsConnected(false);
    });

    peer.on('connection', handleConnection);

    peerRef.current = peer;

    return () => {
      stopKeepAlive();
      peer.destroy();
    };
  }, []);

  const startKeepAlive = () => {
    keepAliveIntervalRef.current = setInterval(() => {
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: MESSAGE_TYPES.PING });
        }
      });
    }, 30000);
  };

  const stopKeepAlive = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
    }
  };

  const handleConnection = (conn) => {
    setupConnectionHandlers(conn);
    connectionsRef.current.set(conn.peer, conn);
    setPeers(new Map(connectionsRef.current));
  };

  const setupConnectionHandlers = (conn) => {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      setPeers(new Map(connectionsRef.current));
    });

    conn.on('data', (data) => {
      handleIncomingData(data, conn);
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      connectionsRef.current.delete(conn.peer);
      setPeers(new Map(connectionsRef.current));
    });
  };

  const handleIncomingData = (data, conn) => {
    switch (data.type) {
      case MESSAGE_TYPES.TEXT_MSG:
        // Handle text message
        break;
      case MESSAGE_TYPES.IMAGE_MSG:
        // Handle image message
        break;
      case MESSAGE_TYPES.FILE_MSG:
        // Handle file message
        break;
      case MESSAGE_TYPES.PING:
        conn.send({ type: MESSAGE_TYPES.PONG });
        break;
      case MESSAGE_TYPES.PONG:
        // Update last seen
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  };

  const connect = async (remotePeerId) => {
    try {
      if (!peerRef.current) throw new Error('Peer not initialized');
      
      const conn = peerRef.current.connect(remotePeerId, {
        reliable: true
      });

      setupConnectionHandlers(conn);
      connectionsRef.current.set(remotePeerId, conn);
      
      return new Promise((resolve, reject) => {
        conn.on('open', () => resolve(conn));
        conn.on('error', reject);
      });
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const sendText = async (text, peerId) => {
    const conn = connectionsRef.current.get(peerId);
    if (!conn || !conn.open) throw new Error('Connection not open');

    const message = {
      type: MESSAGE_TYPES.TEXT_MSG,
      id: uuidv4(),
      text,
      timestamp: Date.now()
    };

    conn.send(message);
    return message;
  };

  const sendFile = async (file, peerId) => {
    const conn = connectionsRef.current.get(peerId);
    if (!conn || !conn.open) throw new Error('Connection not open');

    const fileId = uuidv4();
    const chunks = [];
    const reader = new FileReader();

    reader.onload = (e) => {
      const buffer = e.target.result;
      let offset = 0;

      while (offset < buffer.byteLength) {
        chunks.push(buffer.slice(offset, offset + CHUNK_SIZE));
        offset += CHUNK_SIZE;
      }

      // Send file info
      conn.send({
        type: MESSAGE_TYPES.FILE_MSG,
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        chunks: chunks.length,
        timestamp: Date.now()
      });

      // Send chunks
      chunks.forEach((chunk, index) => {
        conn.send({
          type: MESSAGE_TYPES.FILE_MSG,
          id: fileId,
          chunk,
          index,
          timestamp: Date.now()
        });
      });
    };

    reader.readAsArrayBuffer(file);
    return fileId;
  };

  return {
    peerId,
    peers: Array.from(peers.keys()),
    isConnected,
    error,
    connect,
    sendText,
    sendFile
  };
}; 