import * as alt from 'alt-client';
import * as native from 'natives';
import * as AthenaClient from '@AthenaClient/api';
import { DEATH_CONFIG } from '../../shared/config';
import { DEATH_EVENTS } from '../../shared/events';
import { SCREEN_EFFECTS } from '../../../../shared/enums/screenEffects';
import { isAnyMenuOpen } from '@AthenaClient/webview';
import { drawText2D } from '@AthenaClient/screen/text';
import { LOCALE_DEATH } from '@AthenaPlugins/core-death/shared/locales';

let interval: number;
let timeInTheFuture: number;

native.animpostfxStopAll();

export class Death {
    static init() {
        alt.onServer(DEATH_EVENTS.UPDATE_DEATH_TIMER_MS, Death.updateTimeLeft);
        // alt.on('localMetaChange', Death.handleMetaChange);
        AthenaClient.systems.playerConfig.addCallback('isDead', Death.handleMetaChange);

        AthenaClient.systems.hotkeys.add({
            key: DEATH_CONFIG.RESPAWN_KEY,
            description: 'Death Respawn',
            identifier: 'death-respawn',
            keyDown: Death.handleRespawnKey,
            allowIfDead: true,
            disabled: true,
        });
    }

    private static updateTimeLeft(ms: number) {
        timeInTheFuture = Date.now() + ms;
    }

    private static async handleRespawnKey() {
        alt.logWarning('Respawn Key Pressed');
        // Can respawn now?
        if (timeInTheFuture - Date.now() <= 0) {
            // Unbind the respawn key
            AthenaClient.systems.hotkeys.disable('death-respawn');

            if (!alt.Player.local.meta.isDead) {
                return;
            }

            if (isAnyMenuOpen(true)) {
                return;
            }

            // Switch out player now
            AthenaClient.camera.switch.switchToMultiSecondpart(2000);

            // Wait just a bit for the switch to start
            await alt.Utils.wait(1000);

            // Send the respawn pressed event
            alt.logWarning('Respawn Key Pressed -> sent to server!');
            alt.emitServer(DEATH_EVENTS.RESPAWN_PRESSED);
        }
    }

    private static handleMetaChange(newValue: any): void {
        alt.logWarning('handleMetaChange newValue: ' + newValue + '');

        if (newValue) {
            if (!interval) {
                interval = alt.setInterval(Death.tick, 0);
            }

            // Bind to respawn key
            AthenaClient.systems.hotkeys.enable('death-respawn');

            // Start the effects
            native.playSoundFrontend(-1, 'Bed', 'WastedSounds', true);
            native.shakeGameplayCam('DEATH_FAIL_IN_EFFECT_SHAKE', 1);
            AthenaClient.screen.screenEffect.startEffect(SCREEN_EFFECTS.DEATH_FAIL_NEUTRAL_IN);
            return;
        }

        if (interval) {
            alt.clearInterval(interval);
            interval = undefined;
        }

        // Clear the effects and ragdoll
        native.stopGameplayCamShaking(true);
        AthenaClient.screen.screenEffect.stopEffect(SCREEN_EFFECTS.DEATH_FAIL_NEUTRAL_IN);
        native.clearPedTasksImmediately(alt.Player.local.scriptID);
    }

    private static tick() {
        if (!alt.Player.local.vehicle) {
            if (!native.isPedRagdoll(alt.Player.local.scriptID)) {
                native.setPedToRagdoll(alt.Player.local.scriptID, -1, -1, 0, true, true, false);
            }
        }

        native.hideHudAndRadarThisFrame();

        const timeLeft = timeInTheFuture - Date.now();
        if (timeLeft > 0) {
            drawText2D(
                `${(timeLeft / 1000).toFixed(0)}s ${LOCALE_DEATH.UNTIL_RESPAWN}`,
                { x: 0.5, y: 0.2 },
                0.75,
                new alt.RGBA(255, 255, 255, 255),
            );
        } else {
            drawText2D(LOCALE_DEATH.PRESS_KEY_TO_RESPAWN, { x: 0.5, y: 0.8 }, 1, new alt.RGBA(255, 255, 255, 255), 0);
        }
    }
}
