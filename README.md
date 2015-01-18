% Queue Service
% Fabrice Le Coz
% Janauary, 2015

# Queue service

## installation

### init scripts

file `/etc/init.d/physiodom-queue`

    ### BEGIN INIT INFO
    # Provides:             Interco
    # Required-Start:       mongodb
    # Required-Stop:        mongodb
    # Default-Start:        2 3 4 5
    # Default-Stop:         0 1 6
    # Short-Description:    physioDOM HHR-Pro
    # Description:          physioDOM HHR-Pro
    ### END INIT INFO

    . /lib/lsb/init-functions
    . /etc/environment

    PROGDIR="/home/http/queue"
    PROG="queueService.js"
    LOGDIR="/home/log"
    FOREVER="/usr/local/bin/forever"

    case "$1" in
            start)
                    $FOREVER start -a -l ${LOGDIR}/queue.log \
                                    ${PROGDIR}/${PROG} -s http://127.0.0.1:8443
                    log_end_msg 0
                    ;;
            stop)
                    $FOREVER stop ${PROGDIR}/${PROG}
                    log_end_msg 0
                    ;;
            restart)
                    $FOREVER restart -a -l ${LOGDIR}/queue.log \
                                    ${PROGDIR}/${PROG} -s http://127.0.0.1:8443
                    log_end_msg 0
                    ;;
            status)
                    $FOREVER list
                    ;;
            *)
                    log_success_msg "Usage: `basename $0` {start|stop|restart|status}"
                    exit 1
    esac

file `/etc/init.d/physiodom-mock` 

    ### BEGIN INIT INFO
    # Provides:             Interco
    # Required-Start:       mongodb
    # Required-Stop:        mongodb
    # Default-Start:        2 3 4 5
    # Default-Stop:         0 1 6
    # Short-Description:    physioDOM HHR-Pro
    # Description:          physioDOM HHR-Pro
    ### END INIT INFO

    . /lib/lsb/init-functions
    . /etc/environment

    PROGDIR="/home/http/queue"
    PROG="test/mockSServer.js"
    LOGDIR="/home/log"
    FOREVER="/usr/local/bin/forever"

    case "$1" in
            start)
                    $FOREVER start -a -l ${LOGDIR}/mock.log \
                                    ${PROGDIR}/${PROG}
                    log_end_msg 0
                    ;;
            stop)
                    $FOREVER stop ${PROGDIR}/${PROG}
                    log_end_msg 0
                    ;;
            restart)
                    $FOREVER restart -a -l ${LOGDIR}/app.log \
                                    ${PROGDIR}/${PROG}
                    log_end_msg 0
                    ;;
            status)
                    $FOREVER list
                    ;;
            *)
                    log_success_msg "Usage: `basename $0` {start|stop|restart|status}"
                    exit 1
    esac

### Inscription des services

~~~
sudo update-rc.d physiodom-queue defaults 53
sudo update-rc.d physiodom-mock defaults 51
~~~