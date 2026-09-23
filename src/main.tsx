import { installNetworkLockdown } from './security/networkLockdown';
import './styles.css';

// This is intentionally the only eager application import. Every feature module
// loads after network-capable browser globals have been disabled.
installNetworkLockdown();
void import('./bootstrap');
