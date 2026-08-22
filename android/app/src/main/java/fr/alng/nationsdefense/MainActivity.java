package fr.alng.nationsdefense;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * L'activité qui héberge la WebView du jeu.
 *
 * Elle n'ajoute qu'une chose au comportement par défaut de Capacitor : le plein
 * écran. Sur un téléphone tenu en paysage, la barre d'état coûte une bande de
 * hauteur que la carte isométrique réclame, et son contenu (heure, batterie,
 * notifications) n'a rien à faire par-dessus une partie.
 *
 * La barre de navigation, elle, reste visible : c'est par elle qu'on quitte le
 * jeu. On lui rend donc sa place en marge, ainsi qu'à l'encoche — sans quoi la
 * barre de commandes du HUD tomberait dessous. Android 15 impose de toute façon
 * le dessin bord à bord aux applications récentes : autant l'assumer et gérer
 * les marges nous-mêmes, identiquement sur toutes les versions.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        passerEnPleinEcran();
        margerSurLesBarresRestantes();
    }

    /**
     * Android réaffiche les barres après un glissement depuis le bord, un appel
     * entrant ou un retour depuis une autre application : on remasque à chaque
     * fois que la fenêtre reprend le focus.
     */
    @Override
    public void onWindowFocusChanged(boolean aLeFocus) {
        super.onWindowFocusChanged(aLeFocus);
        if (aLeFocus) passerEnPleinEcran();
    }

    private void passerEnPleinEcran() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controleur = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        // Un glissement depuis le haut rappelle la barre le temps de la lire,
        // puis elle repart toute seule : on ne bloque personne.
        controleur.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controleur.hide(WindowInsetsCompat.Type.statusBars());
    }

    private void margerSurLesBarresRestantes() {
        View contenu = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contenu, (vue, insets) -> {
            // La barre d'état est masquée : elle ne compte pas ici, et c'est
            // exactement la hauteur que le jeu récupère. Le clavier, lui, doit
            // être compté : c'est nous qui gérons les marges désormais, et sans
            // ça il recouvrirait les champs du salon en 1 vs 1.
            Insets marges = insets.getInsets(
                WindowInsetsCompat.Type.navigationBars() |
                WindowInsetsCompat.Type.displayCutout() |
                WindowInsetsCompat.Type.ime()
            );
            vue.setPadding(marges.left, marges.top, marges.right, marges.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
