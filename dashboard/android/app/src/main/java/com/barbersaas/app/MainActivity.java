package com.barbersaas.app;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    // Por defecto, si el celular no tiene internet, el WebView del sistema muestra su
    // propia pantalla de error nativa ("net::ERR_INTERNET_DISCONNECTED", el robot de
    // Android) en vez de algo con la marca de la app. Aquí se reemplaza esa pantalla por
    // public/offline.html (empaquetado dentro del propio APK vía `npx cap sync android`,
    // así que funciona aunque no haya internet).
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.bridge.getWebView().setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/public/offline.html");
                } else {
                    super.onReceivedError(view, request, error);
                }
            }
        });
    }
}
