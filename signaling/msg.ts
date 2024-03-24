export enum SignalingType {
    TYPE_SDP = 1,
    TYPE_ICE = 2,
    START = 3,
    END = 4
}

export type ICE = {
    Candidate: string;
    SDPMid: string;
    SDPMLineIndex: number;
};
export type SDP = {
    Type: 'answer' | 'offer' | 'pranswer' | 'rollback';
    SDPData: string;
};

export type SignalingMessage =
    | {
          type: SignalingType.TYPE_SDP;
          sdp: SDP;
      }
    | {
          type: SignalingType.TYPE_ICE;
          ice: ICE;
      }
    | {
          type: SignalingType.END;
      }
    | {
          type: SignalingType.START;
      };

export function msgString(msg : SignalingMessage) : string {
    switch (msg.type) {
        case SignalingType.END:
            return 'END'
        case SignalingType.START:
            return 'START'
        case SignalingType.TYPE_ICE:
            return msg.ice.Candidate
        case SignalingType.TYPE_SDP:
            return msg.sdp.Type 
    }
}