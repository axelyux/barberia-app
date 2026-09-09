package com.barbersaas.admin;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    // Mismo manejo que la app de las barberías: si no hay internet, se reemplaza la
    // pantalla de error nativa de Android por public/offline.html (empaquetado en el APK).
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
