package ru.arnolder.litcom52;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Always boot from the local splash (update check + admin gate).
 * Restoring WebView state would reopen the last remote URL and skip updates.
 */
public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(null);
  }
}
