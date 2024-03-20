import { MetricCallback } from '../qos/models';
import { Adaptive } from '../qos/qos';
import { SignalingClientTR } from '../signaling/httptr';
import { SignalingMessage, SignalingType } from '../signaling/msg';
import { SignalingClient } from '../signaling/websocket';
import {
    ConnectionEvent,
    Log,
    LogConnectionEvent,
    LogLevel
} from '../utils/log';

export class WebRTC {
    public connected: boolean;
    private Conn: RTCPeerConnection;
    private webrtcConfig: RTCConfiguration;
    private signaling: SignalingClientTR | SignalingClient;
    public Ads: Adaptive;

    private data: any;
    private microphone: boolean;

    private MetricHandler: MetricCallback;
    private TrackHandler: (a: RTCTrackEvent) => any;
    private channelHandler: (a: RTCDataChannelEvent) => any;
    private closeHandler: () => void;

    constructor(
        signalingURL: string,
        webrtcConfig: RTCConfiguration,
        TrackHandler: (a: RTCTrackEvent) => Promise<void>,
        channelHandler: (a: RTCDataChannelEvent) => Promise<void>,
        CloseHandler: () => void,
        metricHandler: MetricCallback,
        no_microphone: boolean,
        data?: any
    ) {
        this.connected = false;
        this.closeHandler = CloseHandler;
        this.MetricHandler = metricHandler;
        this.TrackHandler = TrackHandler;
        this.channelHandler = channelHandler;
        this.webrtcConfig = webrtcConfig;
        this.data = data;
        this.microphone = !no_microphone;

        Log(
            LogLevel.Infor,
            `Started connect to signaling server ${signalingURL}`
        );

        const protocol = new URL(signalingURL).protocol
        if (protocol == 'ws')
            this.signaling = new SignalingClient(
                signalingURL,
                this.handleIncomingPacket.bind(this),
                this.SignalingOnClose.bind(this)
            );
        else if (protocol == 'http' || protocol == 'https')
            this.signaling = new SignalingClientTR(
                signalingURL,
                this.handleIncomingPacket.bind(this),
            );
    }

    private async SignalingOnClose() {
        if (this.connected) return;

        this.Close();
    }

    public Close() {
        this.connected = false;
        this.Conn?.close();
        this.Ads?.Close();
        this.signaling?.Close();
        this.closeHandler();
        this.TrackHandler = () => { };
        this.channelHandler = () => { };
        this.closeHandler = () => { };
        LogConnectionEvent(
            ConnectionEvent.WebRTCConnectionClosed,
            'close',
            this.data as string
        );
    }

    private async handleIncomingPacket(pkt: SignalingMessage) {
        switch (pkt.type) {
            case SignalingType.TYPE_SDP:
                LogConnectionEvent(ConnectionEvent.ExchangingSignalingMessage);
                this.onIncomingSDP({
                    sdp: pkt.sdp.SDPData,
                    type: pkt.sdp.Type
                });
                break;
            case SignalingType.TYPE_ICE:
                LogConnectionEvent(ConnectionEvent.ExchangingSignalingMessage);
                this.onIncomingICE({
                    candidate: pkt.ice.Candidate,
                    sdpMid: pkt.ice.SDPMid != undefined ? pkt.ice.SDPMid : '',
                    sdpMLineIndex:
                        pkt.ice.SDPMLineIndex != undefined
                            ? pkt.ice.SDPMLineIndex
                            : 0
                });
                break;
            case SignalingType.START:
                this.SetupConnection(this.webrtcConfig);
                break;
            case SignalingType.END:
                this.signaling.Close();
                break;
            default:
                break;
        }
    }

    public SetupConnection(config: RTCConfiguration) {
        this.Conn = new RTCPeerConnection(config);
        this.Ads = new Adaptive(this.Conn, this.MetricHandler);

        this.Conn.ondatachannel = this.channelHandler;
        this.Conn.ontrack = this.TrackHandler;
        this.Conn.onicecandidate = this.onICECandidates.bind(this);
        this.Conn.onconnectionstatechange =
            this.onConnectionStateChange.bind(this);
    }

    private async AcquireMicrophone() {
        // Handles being called several times to update labels. Preserve values.
        let localStream: MediaStream = null;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
        } catch {
            console.log(`failed to acquire microphone`);
            return;
        }

        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log(`Using Audio device: ${audioTracks[0].label}`);
        }

        const tracks = localStream.getTracks();
        await this.AddLocalTrack(localStream, tracks);
    }

    private async AddLocalTrack(
        stream: MediaStream,
        tracks: MediaStreamTrack[]
    ) {
        console.log('Adding Local Stream to peer connection');

        tracks.forEach((track) => this.Conn.addTrack(track, stream));

        const transceiver = this.Conn.getTransceivers().find(
            (t) => t?.sender?.track === stream.getAudioTracks()[0]
        );

        const codec = {
            clockRate: 48000,
            channels: 2,
            mimeType: 'audio/opus'
        };

        const { codecs } = RTCRtpSender.getCapabilities('audio');
        const selected = codecs.find((x) => x.mimeType == codec.mimeType);

        transceiver.setCodecPreferences([selected]);
        console.log('Preferred microphone codec', selected);
    }

    private onConnectionStateChange(eve: Event) {
        const successHandler = async () => {
            await new Promise((r) => setTimeout(r, 5000));
            this.connected = true;
            this.DoneHandshake();
            LogConnectionEvent(
                ConnectionEvent.WebRTCConnectionDoneChecking,
                'done',
                this.data as string
            );
            Log(LogLevel.Infor, 'webrtc connection established');
        };

        const connectingHandler = () => {
            LogConnectionEvent(
                ConnectionEvent.WebRTCConnectionChecking,
                'connecting',
                this.data as string
            );
            Log(LogLevel.Infor, 'webrtc connection checking');
        };

        switch (
        (eve.target as RTCPeerConnection)
            .connectionState as RTCPeerConnectionState // "closed" | "connected" | "connecting" | "disconnected" | "failed" | "new";
        ) {
            case 'new':
            case 'connecting':
                connectingHandler();
                break;
            case 'connected':
                successHandler();
                break;
            case 'closed':
            case 'failed':
            case 'disconnected':
                this.Close();
                break;
            default:
                break;
        }
    }

    public async onIncomingICE(ice: RTCIceCandidateInit) {
        try {
            const candidate = new RTCIceCandidate(ice);
            await this.Conn.addIceCandidate(candidate);
        } catch (error) {
            Log(LogLevel.Error, error);
        }
    }

    public async onIncomingSDP(sdp: RTCSessionDescriptionInit) {
        if (sdp.type != 'offer') return;

        try {
            await this.Conn.setRemoteDescription(sdp);
            if (this.microphone)
                try {
                    await this.AcquireMicrophone();
                } catch {
                    console.log('failed to acquire microphone');
                }

            const ans = await this.Conn.createAnswer();
            await this.onLocalDescription(ans);
        } catch (error) {
            Log(LogLevel.Error, error);
        }
    }

    private async onLocalDescription(desc: RTCSessionDescriptionInit) {
        await this.Conn.setLocalDescription(desc);

        if (!this.Conn.localDescription) return;

        const init = this.Conn.localDescription;
        this.signaling.SignallingSend({
            type: SignalingType.TYPE_SDP,
            sdp: {
                Type: init.type,
                SDPData: init.sdp
            }
        });
    }

    private onICECandidates(event: RTCPeerConnectionIceEvent) {
        if (event.candidate == null) {
            Log(LogLevel.Infor, 'ICE Candidate was null, done');
            return;
        }

        const init = event.candidate.toJSON();
        this.signaling.SignallingSend({
            type: SignalingType.TYPE_ICE,
            ice: {
                SDPMid: init.sdpMid,
                Candidate: init.candidate,
                SDPMLineIndex: init.sdpMLineIndex
            }
        });
    }

    private DoneHandshake() {
        this.signaling.SignallingSend({
            type: SignalingType.END
        });
    }
}
