package io.github.drbeefsupreme.posetutor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.drbeefsupreme.posetutor.coach.TutorCoachPlugin;
import io.github.drbeefsupreme.posetutor.pose.TutorPosePlugin;
import io.github.drbeefsupreme.posetutor.secrets.TutorSecretsPlugin;
import io.github.drbeefsupreme.posetutor.voice.TutorVoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TutorPosePlugin.class);
        registerPlugin(TutorVoicePlugin.class);
        registerPlugin(TutorCoachPlugin.class);
        registerPlugin(TutorSecretsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
