import { Composition } from "remotion";
import { GmailAgentDemo } from "./gmail-agent-demo/GmailAgentDemo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="GmailAgentDemo"
        component={GmailAgentDemo}
        durationInFrames={2520}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="GmailAgentDemoVertical"
        component={GmailAgentDemo}
        durationInFrames={2520}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ vertical: true }}
      />
    </>
  );
};
