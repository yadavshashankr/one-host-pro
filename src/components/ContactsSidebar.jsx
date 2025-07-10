import React, { useState } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Badge,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  QrCode as QrCodeIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import QRCode from 'qrcode.react';
import useChatStore from '../store/chatStore';

const ContactsSidebar = ({ peers, peerId, onConnect, activeConversation }) => {
  const [showQR, setShowQR] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [remotePeerId, setRemotePeerId] = useState('');
  const { getUnreadCount, isTyping, getLastSeen } = useChatStore();

  const handleConnect = () => {
    onConnect(remotePeerId);
    setShowConnect(false);
    setRemotePeerId('');
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-80 border-r border-gray-200 bg-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 bg-whatsapp-green text-white flex justify-between items-center">
        <Typography variant="h6">Chats</Typography>
        <div>
          <IconButton color="inherit" onClick={() => setShowQR(true)}>
            <QrCodeIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => setShowConnect(true)}>
            <PersonAddIcon />
          </IconButton>
        </div>
      </div>

      {/* Contacts List */}
      <List className="flex-1 overflow-y-auto">
        {peers.map((peer) => (
          <ListItem
            key={peer}
            button
            selected={peer === activeConversation}
            className="hover:bg-gray-100"
          >
            <ListItemAvatar>
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                variant="dot"
                color={isTyping(peer) ? 'success' : 'default'}
              >
                <Avatar>{peer.slice(0, 2).toUpperCase()}</Avatar>
              </Badge>
            </ListItemAvatar>
            <ListItemText
              primary={peer}
              secondary={
                isTyping(peer)
                  ? 'typing...'
                  : `Last seen ${formatLastSeen(getLastSeen(peer))}`
              }
            />
            {getUnreadCount(peer) > 0 && (
              <Badge
                badgeContent={getUnreadCount(peer)}
                color="primary"
                className="ml-2"
              />
            )}
          </ListItem>
        ))}
      </List>

      {/* QR Code Dialog */}
      <Dialog open={showQR} onClose={() => setShowQR(false)}>
        <DialogTitle>Your QR Code</DialogTitle>
        <DialogContent className="flex flex-col items-center">
          <QRCode value={peerId} size={256} />
          <Typography className="mt-4 text-center break-all">{peerId}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowQR(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Connect Dialog */}
      <Dialog open={showConnect} onClose={() => setShowConnect(false)}>
        <DialogTitle>Connect to Peer</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Peer ID"
            fullWidth
            value={remotePeerId}
            onChange={(e) => setRemotePeerId(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConnect(false)}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!remotePeerId}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default ContactsSidebar; 