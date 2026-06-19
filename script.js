// ─── Global App State ──────────────────────────────────────────────────────────
let userPhoneNumber = "";
let userGhostID = "";
let myPeerInstance = null;
let activeConnections = [];
let typingTimeout = null;
let userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=ghost";

// Radar Map
let radarMapInstance = null;
let currentMapMarker = null;
let pendingIncomingConnection = null;

// Messaging Feature Flags
let isViewOnceEnabled = false;
let mediaRecorderInstance = null;
let recordedAudioChunks = [];
let isRecordingAudio = false;
let selectedMsgIdForContext = null;

// P2P Call State
let localMediaStream = null;
let activeP2PCallInstance = null;
let pendingIncomingCallEvent = null;

// Safety filter
const bannedWords = ["blackmail", "blakmail", "paisa do", "rupay do", "video leak", "threat", "money", "leak"];

// ─── 1. App Lock ───────────────────────────────────────────────────────────────
function checkAppLock() {
    const savedPin = localStorage.getItem("ghostmesh_app_pin");
    if (savedPin) {
        showScreen("lock-screen");
    } else {
        const savedPhone = localStorage.getItem("ghostmesh_saved_phone");
        if (savedPhone) {
            showScreen("wall-screen");
            executeLoginSequence(savedPhone);
        } else {
            showScreen("login-screen");
        }
    }
}

function unlockApp() {
    const pinInput = document.getElementById("app-pin-input").value;
    const savedPin = localStorage.getItem("ghostmesh_app_pin");
    if (pinInput === savedPin) {
        document.getElementById("app-pin-input").value = "";
        const savedPhone = localStorage.getItem("ghostmesh_saved_phone");
        if (savedPhone) {
            showScreen("wall-screen");
            executeLoginSequence(savedPhone);
        } else {
            showScreen("login-screen");
        }
    } else {
        document.getElementById("app-pin-input").value = "";
        showToast("❌ Wrong PIN. Try again.");
    }
}

// ─── 2. Authentication ─────────────────────────────────────────────────────────
function verifyAndLogin() {
    const phoneInput = document.getElementById("phone-number").value.trim();
    const pinSetup = document.getElementById("set-pin-input").value.trim();
    if (phoneInput === "" || phoneInput.length < 10) {
        showToast("⚠️ Enter a valid phone number.");
        return;
    }
    if (pinSetup.length === 4) localStorage.setItem("ghostmesh_app_pin", pinSetup);
    localStorage.setItem("ghostmesh_saved_phone", phoneInput);
    showScreen("wall-screen");
    executeLoginSequence(phoneInput);
}

function executeLoginSequence(phone) {
    userPhoneNumber = phone;
    userGhostID = "Ghost-" + phone.slice(-4);

    document.getElementById("user-badge").innerText = userGhostID;
    userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=" + userGhostID;
    document.getElementById("my-dp-display").src = userCurrentDP;

    initializeMeshNetwork();
    setupTypingListener();
    initRadarMap();
}

// ─── 3. Screen Manager ─────────────────────────────────────────────────────────
function showScreen(id) {
    ["lock-screen", "login-screen", "wall-screen"].forEach(s => {
        const el = document.getElementById(s);
        if (el) {
            if (s === id) el.classList.remove("hidden");
            else el.classList.add("hidden");
        }
    });
}

// ─── 4. Radar Map ──────────────────────────────────────────────────────────────
function initRadarMap() {
    try {
        if (radarMapInstance) {
            radarMapInstance.remove();
            radarMapInstance = null;
        }
        radarMapInstance = L.map('live-radar-map').setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(radarMapInstance);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                radarMapInstance.setView([lat, lng], 13);
                currentMapMarker = L.marker([lat, lng]).addTo(radarMapInstance)
                    .bindPopup(`<b>👻 ${userGhostID}</b><br>Your node is active here.`).openPopup();
                simulateNearbyMeshUsers(lat, lng);
            }, () => {
                simulateNearbyMeshUsers(20.5937, 78.9629);
            });
        } else {
            simulateNearbyMeshUsers(20.5937, 78.9629);
        }
    } catch (e) {
        console.error("Map init failed:", e);
    }
}

function toggleMapVisibility() {
    const mapDiv = document.getElementById("map-container");
    if (mapDiv.classList.contains("hidden")) {
        mapDiv.classList.remove("hidden");
        if (radarMapInstance) setTimeout(() => radarMapInstance.invalidateSize(), 300);
    } else {
        mapDiv.classList.add("hidden");
    }
}

function simulateNearbyMeshUsers(lat, lng) {
    const dummyNodes = [
        { id: "Ghost-4683", latOffset: 0.005, lngOffset: 0.003 },
        { id: "Ghost-7446", latOffset: -0.004, lngOffset: -0.006 },
        { id: "Ghost-9122", latOffset: 0.002, lngOffset: -0.003 }
    ];
    dummyNodes.forEach(node => {
        L.marker([lat + node.latOffset, lng + node.lngOffset]).addTo(radarMapInstance)
            .bindPopup(`
                <b>👾 ${node.id}</b><br>
                Status: Available<br>
                <button class="map-connect-btn" onclick="connectToTargetPeer('${node.id}')">⚡ Connect</button>
            `);
    });
}

function connectToTargetPeer(targetID) {
    if (!targetID || targetID === userGhostID) return;
    updateSystemStatus(`📡 Sending link request to ${targetID}...`);
    const conn = myPeerInstance.connect(targetID);
    setupConnectionListeners(conn);
}

// ─── 5. P2P Network ────────────────────────────────────────────────────────────
function initializeMeshNetwork() {
    if (myPeerInstance) {
        myPeerInstance.destroy();
        myPeerInstance = null;
    }

    myPeerInstance = new Peer(userGhostID);

    myPeerInstance.on('open', (id) => {
        updateSystemStatus("✅ Node live. Your ID: " + id);
    });

    myPeerInstance.on('connection', (incomingConn) => {
        handleIncomingConnectionRequest(incomingConn);
        setupConnectionListeners(incomingConn);
    });

    myPeerInstance.on('call', (incomingCall) => handleIncomingCallSetup(incomingCall));

    myPeerInstance.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            // ID taken — retry with timestamp suffix
            userGhostID = "Ghost-" + userPhoneNumber.slice(-4) + "-" + Date.now().toString().slice(-3);
            document.getElementById("user-badge").innerText = userGhostID;
            myPeerInstance = new Peer(userGhostID);
        } else {
            updateSystemStatus("⚠️ Network syncing...");
        }
    });
}

function connectFromUI() {
    const targetID = document.getElementById("peer-id-input").value.trim();
    if (!targetID || targetID === userGhostID) return;
    connectToTargetPeer(targetID);
    closeConnectModal();
}

function setupConnectionListeners(conn) {
    conn.on('open', () => {
        conn.send({ type: "dp-update", sender: userGhostID, dpData: userCurrentDP });
    });

    conn.on('data', (data) => {
        if (!data || !data.type) return;

        switch (data.type) {
            case "handshake-status":
                if (data.approved) {
                    updateSystemStatus(`🎉 Connected with ${data.sender || conn.peer}!`);
                    if (!activeConnections.some(c => c.peer === conn.peer)) activeConnections.push(conn);
                } else {
                    updateSystemStatus(`❌ Request rejected by ${data.sender || conn.peer}.`);
                    conn.close();
                }
                break;

            case "chat":
                appendMessage(data.sender, data.text, "incoming", data.msgId, data.senderDP, data.contentType, data.mediaPayload, data.viewOnce);
                if (conn.open) conn.send({ type: "ack", msgId: data.msgId });
                break;

            case "typing":
                const indicator = document.getElementById("typing-indicator");
                if (data.isTyping) {
                    indicator.innerText = `${data.sender} is typing...`;
                    indicator.classList.remove("hidden");
                } else {
                    indicator.classList.add("hidden");
                }
                break;

            case "ack":
                const tick = document.getElementById(`tick-${data.msgId}`);
                if (tick) { tick.innerText = " ✓✓"; tick.style.color = "#53bdeb"; }
                break;

            case "dp-update":
                window["dp_" + data.sender] = data.dpData;
                document.querySelectorAll(`.msg-avatar-${data.sender}`).forEach(img => img.src = data.dpData);
                break;

            case "reaction":
                renderReactionLocal(data.msgId, data.emoji);
                break;

            case "delete":
                renderDeleteLocal(data.msgId);
                break;
        }
    });

    conn.on('close', () => {
        activeConnections = activeConnections.filter(c => c.peer !== conn.peer);
        updateSystemStatus(`🔌 ${conn.peer} disconnected.`);
    });

    conn.on('error', (err) => {
        console.error("Connection error:", err);
    });
}

// ─── 6. Accept / Reject Connections ───────────────────────────────────────────
function handleIncomingConnectionRequest(conn) {
    pendingIncomingConnection = conn;
    document.getElementById("request-modal-text").innerText =
        `${conn.peer} wants to link with your secure node. Accept?`;
    document.getElementById("request-modal").classList.remove("hidden");
}

function acceptConnectionRequest() {
    document.getElementById("request-modal").classList.add("hidden");
    if (pendingIncomingConnection) {
        const peer = pendingIncomingConnection.peer;
        pendingIncomingConnection.send({ type: "handshake-status", approved: true, sender: userGhostID });
        if (!activeConnections.some(c => c.peer === peer)) activeConnections.push(pendingIncomingConnection);
        updateSystemStatus(`✅ Linked with ${peer}`);
        pendingIncomingConnection = null;
    }
}

function rejectConnectionRequest() {
    document.getElementById("request-modal").classList.add("hidden");
    if (pendingIncomingConnection) {
        pendingIncomingConnection.send({ type: "handshake-status", approved: false, sender: userGhostID });
        setTimeout(() => { if (pendingIncomingConnection) { pendingIncomingConnection.close(); pendingIncomingConnection = null; } }, 500);
        updateSystemStatus("❌ Request rejected.");
    }
}

// ─── 7. Messaging ──────────────────────────────────────────────────────────────
function sendMessage() {
    const msgInput = document.getElementById("msg-input");
    const txt = msgInput.value.trim();
    if (txt === "") return;
    const lower = txt.toLowerCase();
    for (const word of bannedWords) {
        if (lower.includes(word)) {
            showToast("⚠️ Security Violation! Message blocked.");
            msgInput.value = "";
            return;
        }
    }
    sendMessageBundle("text", txt);
    msgInput.value = "";
}

function sendMessageBundle(contentType, payload) {
    const msgId = "msg-" + Date.now();
    const textDisplay = contentType === "text" ? payload : "";

    appendMessage(userGhostID, textDisplay, "outgoing", msgId, userCurrentDP, contentType, payload, isViewOnceEnabled);
    broadcastToMesh({
        type: "chat", msgId, sender: userGhostID,
        text: textDisplay, senderDP: userCurrentDP,
        contentType, mediaPayload: payload,
        viewOnce: isViewOnceEnabled
    });
    if (isViewOnceEnabled) toggleViewOnceMode();
}

function broadcastToMesh(obj) {
    activeConnections.forEach(conn => { if (conn && conn.open) conn.send(obj); });
}

function appendMessage(sender, text, direction, msgId, avatarSrc, contentType, mediaPayload, viewOnce) {
    const container = document.getElementById("messages-container");

    const card = document.createElement("div");
    card.id = msgId;
    card.setAttribute("data-sender", sender);
    card.className = `card ${direction}`;
    card.onclick = () => openReactionModal(msgId);

    // Avatar (only for incoming)
    if (direction === "incoming") {
        const img = document.createElement("img");
        img.src = avatarSrc || window["dp_" + sender] || `https://api.dicebear.com/7.x/bottts/svg?seed=${sender}`;
        img.className = `msg-avatar-${sender}`;
        img.style.cssText = "width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;align-self:flex-end;";
        card.appendChild(img);
    }

    // Content wrapper
    const contentDiv = document.createElement("div");
    contentDiv.style.maxWidth = "100%";

    // Sender name (only for incoming)
    if (direction === "incoming") {
        const senderDiv = document.createElement("div");
        senderDiv.className = "sender";
        senderDiv.innerText = sender;
        contentDiv.appendChild(senderDiv);
    }

    // Text node
    const txtNode = document.createElement("div");
    txtNode.className = "msg-text-content";

    if (viewOnce && direction === "incoming") {
        txtNode.innerHTML = `<span style="color:var(--accent-bright);font-weight:600;">👁 View Once</span>`;
        const btn = document.createElement("button");
        btn.innerText = "Tap to view";
        btn.className = "confirm-btn";
        btn.style.cssText = "margin-top:6px;padding:5px 12px;font-size:12px;";
        btn.onclick = (e) => {
            e.stopPropagation();
            txtNode.innerHTML = text || "";
            renderActualMedia(txtNode, contentType, mediaPayload);
            btn.remove();
        };
        txtNode.appendChild(btn);
    } else {
        txtNode.innerText = text || "";
        renderActualMedia(txtNode, contentType, mediaPayload);
    }

    contentDiv.appendChild(txtNode);

    // Tick for outgoing
    if (direction === "outgoing") {
        const meta = document.createElement("div");
        meta.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:3px;margin-top:2px;";
        const tick = document.createElement("span");
        tick.id = `tick-${msgId}`;
        tick.className = "msg-tick";
        tick.innerText = " ✓";
        meta.appendChild(tick);
        contentDiv.appendChild(meta);
    }

    card.appendChild(contentDiv);
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
}

function renderActualMedia(targetNode, type, payload) {
    if (type === "media" && payload) {
        const wrap = document.createElement("div");
        wrap.className = "media-container";
        wrap.style.marginTop = "6px";
        if (payload.fileType && payload.fileType.startsWith("image/")) {
            wrap.innerHTML = `<img src="${payload.fileData}" class="shared-img">`;
        } else if (payload.fileType && payload.fileType.startsWith("video/")) {
            wrap.innerHTML = `<video src="${payload.fileData}" controls class="shared-video"></video>`;
        } else {
            wrap.innerHTML = `<a href="${payload.fileData}" download="${payload.fileName}" style="color:var(--accent-bright);text-decoration:underline;font-weight:600;">📁 ${payload.fileName}</a>`;
        }
        targetNode.appendChild(wrap);
    } else if (type === "audio" && payload) {
        const wrap = document.createElement("div");
        wrap.className = "media-container";
        wrap.style.marginTop = "6px";
        wrap.innerHTML = `<audio src="${payload}" controls style="max-width:220px;display:block;"></audio>`;
        targetNode.appendChild(wrap);
    }
}

// ─── 8. Reactions & Delete ─────────────────────────────────────────────────────
function sendReaction(emoji) {
    closeReactionModal();
    renderReactionLocal(selectedMsgIdForContext, emoji);
    broadcastToMesh({ type: "reaction", msgId: selectedMsgIdForContext, emoji });
}

function triggerDeleteForEveryone() {
    closeReactionModal();
    const card = document.getElementById(selectedMsgIdForContext);
    if (card && card.getAttribute("data-sender") === userGhostID) {
        renderDeleteLocal(selectedMsgIdForContext);
        broadcastToMesh({ type: "delete", msgId: selectedMsgIdForContext });
    } else {
        showToast("⚠️ You can only delete your own messages!");
    }
}

function renderReactionLocal(msgId, emoji) {
    const card = document.getElementById(msgId);
    if (!card) return;
    let badge = card.querySelector(".reaction-badge");
    if (!badge) {
        badge = document.createElement("span");
        badge.className = "reaction-badge";
        card.appendChild(badge);
    }
    badge.innerText = emoji;
}

function renderDeleteLocal(msgId) {
    const card = document.getElementById(msgId);
    if (!card) return;
    const txt = card.querySelector(".msg-text-content");
    if (txt) { txt.innerText = "🚫 This message was deleted"; txt.style.cssText = "font-style:italic;opacity:0.5;"; }
    const media = card.querySelector(".media-container");
    if (media) media.remove();
}

// ─── 9. Media & DP ─────────────────────────────────────────────────────────────
function triggerDPUpload() { document.getElementById("dp-file-input").click(); }
function handleDPChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        userCurrentDP = e.target.result;
        document.getElementById("my-dp-display").src = userCurrentDP;
        broadcastToMesh({ type: "dp-update", sender: userGhostID, dpData: userCurrentDP });
    };
    reader.readAsDataURL(file);
}

function triggerFileAttachment() { document.getElementById("attachment-file-input").click(); }
function handleFileAttachment(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        sendMessageBundle("media", { fileData: e.target.result, fileName: file.name, fileType: file.type });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

function toggleViewOnceMode() {
    isViewOnceEnabled = !isViewOnceEnabled;
    const btn = document.getElementById("view-once-btn");
    const badge = document.getElementById("view-once-badge");
    btn.style.color = isViewOnceEnabled ? "#ef4444" : "var(--text-secondary)";
    if (isViewOnceEnabled) badge.classList.remove("hidden");
    else badge.classList.add("hidden");
}

function toggleVoiceRecord() {
    if (!isRecordingAudio) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            recordedAudioChunks = [];
            mediaRecorderInstance = new MediaRecorder(stream);
            mediaRecorderInstance.ondataavailable = e => recordedAudioChunks.push(e.data);
            mediaRecorderInstance.onstop = () => {
                const blob = new Blob(recordedAudioChunks, { type: 'audio/ogg; codecs=opus' });
                const reader = new FileReader();
                reader.onload = (e) => sendMessageBundle("audio", e.target.result);
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorderInstance.start();
            isRecordingAudio = true;
            document.getElementById("voice-record-btn").innerText = "🛑";
            showToast("🎙️ Recording...");
        }).catch(() => showToast("⚠️ Mic permission denied."));
    } else {
        mediaRecorderInstance.stop();
        isRecordingAudio = false;
        document.getElementById("voice-record-btn").innerText = "🎙️";
    }
}

// ─── 10. Voice / Video Calls ───────────────────────────────────────────────────
function initiateP2PCall(callType) {
    if (activeConnections.length === 0) { showToast("⚠️ Connect to a peer first!"); return; }
    const targetID = activeConnections[0].peer;
    navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }).then(stream => {
        localMediaStream = stream;
        document.getElementById("call-screen").classList.remove("hidden");
        document.getElementById("call-status-label").innerText = `📞 Outgoing ${callType === 'video' ? 'Video' : 'Voice'} Call...`;
        document.getElementById("call-peer-label").innerText = `Calling: ${targetID}`;
        if (callType === 'video') {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("local-video").srcObject = stream;
        }
        activeP2PCallInstance = myPeerInstance.call(targetID, stream, { metadata: { type: callType } });
        attachCallStreamListeners(activeP2PCallInstance);
    }).catch(() => showToast("⚠️ Camera/Mic access denied."));
}

function attachCallStreamListeners(callObj) {
    callObj.on('stream', remoteStream => {
        document.getElementById("call-status-label").innerText = "🟢 Connected";
        const isVideo = callObj.metadata && callObj.metadata.type === 'video';
        if (isVideo) {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("remote-video").srcObject = remoteStream;
        } else {
            document.getElementById("remote-video").srcObject = remoteStream;
            document.getElementById("video-grid").classList.add("hidden");
        }
    });
    callObj.on('close', endCurrentCallLocalFlow);
    callObj.on('error', endCurrentCallLocalFlow);
}

function handleIncomingCallSetup(incomingCall) {
    pendingIncomingCallEvent = incomingCall;
    const callType = incomingCall.metadata && incomingCall.metadata.type === 'video' ? 'Video' : 'Voice';
    document.getElementById("call-screen").classList.remove("hidden");
    document.getElementById("call-status-label").innerText = `🔔 Incoming ${callType} Call...`;
    document.getElementById("call-peer-label").innerText = `From: ${incomingCall.peer}`;
    document.getElementById("accept-call-btn").classList.remove("hidden");
}

function acceptIncomingCall() {
    document.getElementById("accept-call-btn").classList.add("hidden");
    const callType = pendingIncomingCallEvent.metadata && pendingIncomingCallEvent.metadata.type;
    navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }).then(stream => {
        localMediaStream = stream;
        if (callType === 'video') {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("local-video").srcObject = stream;
        }
        pendingIncomingCallEvent.answer(stream);
        attachCallStreamListeners(pendingIncomingCallEvent);
    }).catch(() => showToast("⚠️ Could not access camera/mic."));
}

function endCurrentCall() {
    if (activeP2PCallInstance) activeP2PCallInstance.close();
    if (pendingIncomingCallEvent) pendingIncomingCallEvent.close();
    endCurrentCallLocalFlow();
}

function endCurrentCallLocalFlow() {
    if (localMediaStream) localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null; activeP2PCallInstance = null; pendingIncomingCallEvent = null;
    document.getElementById("remote-video").srcObject = null;
    document.getElementById("local-video").srcObject = null;
    document.getElementById("call-screen").classList.add("hidden");
    document.getElementById("accept-call-btn").classList.add("hidden");
    document.getElementById("video-grid").classList.add("hidden");
}

// ─── 11. UI Helpers ─────────────────────────────────────────────────────────────
function toggleAppTheme() {
    const body = document.body;
    const btn = document.getElementById("theme-toggle-btn");
    if (body.classList.contains("dark-theme")) {
        body.classList.replace("dark-theme", "light-theme");
        btn.innerText = "🌙";
    } else {
        body.classList.replace("light-theme", "dark-theme");
        btn.innerText = "☀️";
    }
}

function openConnectModal() { document.getElementById("connect-modal").classList.remove("hidden"); }
function closeConnectModal() {
    document.getElementById("connect-modal").classList.add("hidden");
    document.getElementById("peer-id-input").value = "";
}
function openReactionModal(msgId) { selectedMsgIdForContext = msgId; document.getElementById("reaction-modal").classList.remove("hidden"); }
function closeReactionModal() { document.getElementById("reaction-modal").classList.add("hidden"); }

function setupTypingListener() {
    const input = document.getElementById("msg-input");
    if (!input) return;
    input.addEventListener("input", () => {
        broadcastToMesh({ type: "typing", sender: userGhostID, isTyping: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => broadcastToMesh({ type: "typing", sender: userGhostID, isTyping: false }), 2000);
    });
}

function updateSystemStatus(msg) {
    const container = document.getElementById("messages-container");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "system-msg";
    div.innerText = msg;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Toast notification
function showToast(msg) {
    let toast = document.getElementById("ghost-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "ghost-toast";
        toast.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.85); color:white; padding:10px 20px;
            border-radius:22px; font-size:13px; z-index:9999;
            white-space:nowrap; pointer-events:none;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}
