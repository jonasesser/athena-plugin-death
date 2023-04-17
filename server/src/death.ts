import * as alt from 'alt-server';
import { IVector3 } from 'alt-shared';
import * as Athena from '@AthenaServer/api';
import { distance2d } from '@AthenaShared/utility/vector';
import { DEATH_EVENTS } from '../../shared/events';
import { DEATH_CONFIG } from './config';

const TimeOfDeath: { [_id: string]: number } = {};

export class DeathSystem {
    static init() {
        Athena.player.events.on('respawned', DeathSystem.handleCharacterRespawn);
        Athena.player.events.on('player-died', DeathSystem.handleDeath);
        Athena.player.events.on('selected-character', DeathSystem.handleCharacterSelect);

        Athena.systems.defaults.death.disable();

        // Player can now press a key to respawn
        alt.onClient(DEATH_EVENTS.RESPAWN_PRESSED, DeathSystem.handleRespawnPress);
    }

    /**
     * This is a server-side time in the future for the given player.
     *
     * It will return undefined / null if it's not set.
     *
     * @static
     * @memberof DeathSystem
     */
    static getRespawnTime(player: alt.Player): number | undefined {
        //TODO: !playerFullySpawned not available anymore
        if (!player || !player.valid) {
            return undefined;
        }

        const playerData = Athena.document.character.get(player);

        if (!TimeOfDeath[playerData._id.toString()]) {
            return undefined;
        }

        return TimeOfDeath[playerData._id.toString()];
    }

    /**
     * Used to clear stored respawn time.
     *
     * @static
     * @param {alt.Player} player
     * @memberof DeathSystem
     */
    static clearRespawnTime(player: alt.Player) {
        const playerData = Athena.document.character.get(player);
        delete TimeOfDeath[playerData._id.toString()];
    }

    /**
     * Handle key press to respawn
     * @param player
     * @returns
     */
    private static handleRespawnPress(player: alt.Player): void {
        alt.logWarning('Respawn Key Pressed');
        if (!player || !player.valid) {
            return;
        }

        const playerData = Athena.document.character.get(player);
        if (!playerData.isDead) {
            return;
        }

        const timeInFuture = DeathSystem.getRespawnTime(player);
        if (typeof timeInFuture === 'undefined') {
            return;
        }

        if (Date.now() < timeInFuture) {
            return;
        }

        alt.logWarning('Respawn!');
        Athena.player.set.respawned(player, null);
    }

    /**
     * Called when the player is invoked with a respawn.
     *
     * @private
     * @static
     * @param {alt.Player} player
     * @param {IVector3} [position=undefined]
     * @memberof DeathSystem
     */
    private static async handleCharacterRespawn(player: alt.Player, position: IVector3 = undefined) {
        alt.logWarning('handleCharacterRespawn');
        let nearestHopsital = position;
        if (!position) {
            const hospitals = [...DEATH_CONFIG.HOSPITALS];
            let index = 0;
            let lastDistance = distance2d(player.pos, hospitals[0]);

            for (let i = 1; i < hospitals.length; i++) {
                const dist = distance2d(player.pos, hospitals[i]);
                if (dist > lastDistance) {
                    continue;
                }

                lastDistance = dist;
                index = i;
            }

            nearestHopsital = hospitals[index] as alt.Vector3;

            if (DEATH_CONFIG.LOSE_ALL_WEAPONS_ON_RESPAWN) {
                await Athena.player.weapons.clear(player);
            }
        }

        Athena.player.safe.setPosition(player, nearestHopsital.x, nearestHopsital.y, nearestHopsital.z);

        Athena.player.safe.addHealth(player, DEATH_CONFIG.RESPAWN_HEALTH, true);
        Athena.player.safe.addArmour(player, DEATH_CONFIG.RESPAWN_ARMOUR, true);

        Athena.document.character.set(player, 'isDead', false);
        player.spawn(nearestHopsital.x, nearestHopsital.y, nearestHopsital.z, 0);

        alt.nextTick(() => {
            player.clearBloodDamage();
            DeathSystem.clearRespawnTime(player);
        });
    }

    /**
     * Verifies information about player health after selecting character.
     * Sets them to a dead state if they haven't served their death sentence.
     *
     * @private
     * @static
     * @param {alt.Player} player
     * @memberof DeathSystem
     */
    private static handleCharacterSelect(player: alt.Player) {
        const playerData = Athena.document.character.get(player);
        if (playerData.health <= 99) {
            const id = Athena.systems.identifier.getIdByStrategy(player);
            alt.log(`(${id}) ${playerData.name} has died.`);

            try {
                Athena.document.character.set(player, 'isDead', true);
                Athena.player.events.trigger('player-died', player);
            } catch (err) {
                alt.logError(err);
                alt.log(`Could not set player ${playerData.name} to dead.`);
            }
        }

        if (!playerData.isDead) {
            //TODO Check
            // Athena.player.emit.meta(player, 'isDead', false);
            Athena.config.player.set(player, 'isDead', false);
        }

        if (playerData.isDead) {
            //TODO Check
            Athena.config.player.set(player, 'isDead', true);
            // Athena.player.emit.meta(player, 'isDead', true);

            if (!TimeOfDeath[playerData._id.toString()]) {
                TimeOfDeath[playerData._id.toString()] = Date.now() + DEATH_CONFIG.RESPAWN_TIME;
            }

            alt.emitClient(
                player,
                DEATH_EVENTS.UPDATE_DEATH_TIMER_MS,
                TimeOfDeath[playerData._id.toString()] - Date.now(),
            );
        }
    }

    /**
     * Called when the player has died.
     *
     * @private
     * @static
     * @param {alt.Player} player
     * @param {*} [weaponHash=null]
     * @return {void}
     * @memberof DeathSystem
     */
    private static handleDeath(player: alt.Player, weaponHash: any = null): void {
        if (!player || !player.valid) {
            return;
        }

        const playerData = Athena.document.character.get(player);

        Athena.config.player.set(player, 'isDead', true);

        if (!TimeOfDeath[playerData._id.toString()]) {
            TimeOfDeath[playerData._id.toString()] = Date.now() + DEATH_CONFIG.RESPAWN_TIME;
        }

        alt.emitClient(player, DEATH_EVENTS.UPDATE_DEATH_TIMER_MS, TimeOfDeath[playerData._id.toString()] - Date.now());
    }
}
